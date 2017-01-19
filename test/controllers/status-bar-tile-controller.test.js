import fs from 'fs';
import path from 'path';

import etch from 'etch';
import until from 'test-until';

import {cloneRepository, buildRepository, setUpLocalAndRemoteRepositories} from '../helpers';
import StatusBarTileController from '../../lib/controllers/status-bar-tile-controller';

describe('StatusBarTileController', function() {
  let atomEnvironment, workspace, workspaceElement, commandRegistry;

  beforeEach(function() {
    atomEnvironment = global.buildAtomEnvironment();
    workspace = atomEnvironment.workspace;
    commandRegistry = atomEnvironment.commands;

    workspaceElement = atomEnvironment.views.getView(workspace);
  });

  afterEach(function() {
    atomEnvironment.destroy();
  });

  describe('branches', function() {
    it('indicates the current branch and toggles visibility of the branch menu when clicked', async function() {
      const workdirPath = await cloneRepository('three-files');
      const repository = await buildRepository(workdirPath);

      const controller = new StatusBarTileController({workspace, repository, commandRegistry});
      await controller.getLastModelDataRefreshPromise();

      const branchView = controller.refs.branchView;
      assert.equal(branchView.element.textContent, 'master');

      // FIXME: Remove this guard when 1.13 is on stable.
      if (parseFloat(atom.getVersion() >= 1.13)) {
        assert.isUndefined(document.querySelectorAll('.github-BranchMenuView')[0]);
        branchView.element.click();
        assert.isDefined(document.querySelectorAll('.github-BranchMenuView')[0]);
        branchView.element.click();
        assert.isUndefined(document.querySelectorAll('.github-BranchMenuView')[0]);
      }
    });

    describe('the branch menu', function() {
      describe('checking out an existing branch', function() {
        it('can check out existing branches with no conflicts', async function() {
          const workdirPath = await cloneRepository('three-files');
          const repository = await buildRepository(workdirPath);

          // create branch called 'branch'
          await repository.git.exec(['branch', 'branch']);

          const controller = new StatusBarTileController({workspace, repository, commandRegistry});
          await controller.getLastModelDataRefreshPromise();

          const branchMenuView = controller.branchMenuView;
          const {list} = branchMenuView.refs;

          const branches = Array.from(list.options).map(option => option.value);
          assert.deepEqual(branches, ['branch', 'master']);
          assert.equal(await repository.getCurrentBranch(), 'master');
          assert.equal(list.selectedOptions[0].value, 'master');

          list.selectedIndex = branches.indexOf('branch');
          list.onchange();
          assert.equal(await repository.getCurrentBranch(), 'branch');
          assert.equal(list.selectedOptions[0].value, 'branch');

          list.selectedIndex = branches.indexOf('master');
          list.onchange();
          assert.equal(await repository.getCurrentBranch(), 'master');
          assert.equal(list.selectedOptions[0].value, 'master');
        });

        it('displays an error message if checkout fails', async function() {
          const {localRepoPath} = await setUpLocalAndRemoteRepositories('three-files');
          const repository = await buildRepository(localRepoPath);
          await repository.git.exec(['branch', 'branch']);

          // create a conflict
          fs.writeFileSync(path.join(localRepoPath, 'a.txt'), 'a change');

          await repository.git.exec(['commit', '-a', '-m', 'change on master']);
          await repository.checkout('branch');
          fs.writeFileSync(path.join(localRepoPath, 'a.txt'), 'a change that conflicts');

          const controller = new StatusBarTileController({workspace, repository, commandRegistry});
          await controller.getLastModelDataRefreshPromise();

          const branchMenuView = controller.branchMenuView;
          const {list, message} = branchMenuView.refs;

          const branches = Array.from(list.options).map(option => option.value);
          assert.equal(await repository.getCurrentBranch(), 'branch');
          assert.equal(list.selectedOptions[0].value, 'branch');

          list.selectedIndex = branches.indexOf('master');
          list.onchange();
          await etch.getScheduler().getNextUpdatePromise();
          assert.equal(await repository.getCurrentBranch(), 'branch');
          assert.equal(list.selectedOptions[0].value, 'branch');
          await until(() => message.innerHTML.match(/local changes.*would be overwritten/), 'error message displays');
        });
      });

      describe('checking out newly created branches', function() {
        it('can check out newly created branches', async function() {
          const workdirPath = await cloneRepository('three-files');
          const repository = await buildRepository(workdirPath);

          const controller = new StatusBarTileController({workspace, repository, commandRegistry});
          await controller.getLastModelDataRefreshPromise();

          const branchMenuView = controller.branchMenuView;
          const {list, newBranchButton} = branchMenuView.refs;

          const branches = Array.from(list.options).map(option => option.value);
          assert.deepEqual(branches, ['master']);
          assert.equal(await repository.getCurrentBranch(), 'master');
          assert.equal(list.selectedOptions[0].value, 'master');

          assert.isDefined(branchMenuView.refs.list);
          assert.isUndefined(branchMenuView.refs.editor);
          newBranchButton.click();
          await etch.getScheduler().getNextUpdatePromise();
          assert.isUndefined(branchMenuView.refs.list);
          assert.isDefined(branchMenuView.refs.editor);

          branchMenuView.refs.editor.setText('new-branch');
          await newBranchButton.onclick();
          repository.refresh();
          await controller.getLastModelDataRefreshPromise();

          assert.isUndefined(branchMenuView.refs.editor);
          assert.isDefined(branchMenuView.refs.list);

          assert.equal(await repository.getCurrentBranch(), 'new-branch');
          assert.equal(branchMenuView.refs.list.selectedOptions[0].value, 'new-branch');
        });

        it('displays an error message if branch already exists', async function() {
          const workdirPath = await cloneRepository('three-files');
          const repository = await buildRepository(workdirPath);

          await repository.git.exec(['checkout', '-b', 'branch']);

          const controller = new StatusBarTileController({workspace, repository, commandRegistry});
          await controller.getLastModelDataRefreshPromise();

          const branchMenuView = controller.branchMenuView;
          const {list, newBranchButton, message} = branchMenuView.refs;

          const branches = Array.from(branchMenuView.refs.list.options).map(option => option.value);
          assert.deepEqual(branches, ['branch', 'master']);
          assert.equal(await repository.getCurrentBranch(), 'branch');
          assert.equal(list.selectedOptions[0].value, 'branch');

          await newBranchButton.onclick();

          branchMenuView.refs.editor.setText('master');
          await newBranchButton.onclick();
          assert.match(message.innerHTML, /branch.*already exists/);

          assert.equal(await repository.getCurrentBranch(), 'branch');
          assert.equal(branchMenuView.refs.list.selectedOptions[0].value, 'branch');
        });
      });
    });
  });

  describe('pushing and pulling', function() {
    it('indicates the ahead and behind counts and toggles visibility of the push pull menu when clicked', async function() {
      const {localRepoPath} = await setUpLocalAndRemoteRepositories();
      const repository = await buildRepository(localRepoPath);

      const controller = new StatusBarTileController({workspace, repository, commandRegistry});
      await controller.getLastModelDataRefreshPromise();

      const pushPullView = controller.refs.pushPullView;
      const {aheadCount, behindCount} = pushPullView.refs;
      assert.equal(aheadCount.textContent, '');
      assert.equal(behindCount.textContent, '');

      await repository.git.exec(['reset', '--hard', 'head~2']);
      repository.refresh();
      await controller.getLastModelDataRefreshPromise();
      assert.equal(aheadCount.textContent, '');
      assert.equal(behindCount.textContent, '2');

      await repository.git.commit('new local commit', {allowEmpty: true});
      repository.refresh();
      await controller.getLastModelDataRefreshPromise();
      assert.equal(aheadCount.textContent, '1');
      assert.equal(behindCount.textContent, '2');

      // FIXME: Remove this guard when 1.13 is on stable.
      if (parseFloat(atom.getVersion() >= 1.13)) {
        assert.isUndefined(document.querySelectorAll('.github-PushPullMenuView')[0]);
        pushPullView.element.click();
        assert.isDefined(document.querySelectorAll('.github-PushPullMenuView')[0]);
        pushPullView.element.click();
        assert.isUndefined(document.querySelectorAll('.github-PushPullMenuView')[0]);
      }
    });

    describe('the push/pull menu', function() {
      it('disables the pull button when there are changed files', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories();
        const repository = await buildRepository(localRepoPath);

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        const pushPullMenuView = controller.pushPullMenuView;
        const {pullButton} = pushPullMenuView.refs;
        await repository.git.exec(['reset', '--hard', 'head~2']);
        repository.refresh();
        await controller.getLastModelDataRefreshPromise();

        assert.isFalse(pullButton.disabled);

        fs.writeFileSync(path.join(localRepoPath, 'file.txt'), 'a change\n');
        repository.refresh();
        await controller.getLastModelDataRefreshPromise();
        assert.isTrue(pullButton.disabled);

        await repository.stageFiles(['file.txt']);
        repository.refresh();
        await controller.getLastModelDataRefreshPromise();
        assert.isTrue(pullButton.disabled);

        await repository.commit('commit changes');
        repository.refresh();
        await controller.getLastModelDataRefreshPromise();
        assert.isFalse(pullButton.disabled);
      });

      it('disables the fetch and pull buttons when there is no remote tracking branch and displays informative message', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories();
        const repository = await buildRepository(localRepoPath);
        await repository.git.exec(['checkout', '-b', 'new-branch']);

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        const pushPullMenuView = controller.pushPullMenuView;
        const {pushButton, pullButton, fetchButton, message} = pushPullMenuView.refs;

        assert.isTrue(pullButton.disabled);
        assert.isTrue(fetchButton.disabled);
        assert.match(message.innerHTML, /No remote detected.*Pushing will set up a remote tracking branch/);

        pushButton.dispatchEvent(new MouseEvent('click'));
        repository.refresh();
        await controller.getLastModelDataRefreshPromise();

        assert.isFalse(pullButton.disabled);
        assert.isFalse(fetchButton.disabled);
        assert.equal(message.textContent, '');
      });

      it('displays an error message if push fails and allows force pushing if meta key is pressed', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories();
        const repository = await buildRepository(localRepoPath);
        await repository.git.exec(['reset', '--hard', 'head~2']);
        await repository.git.commit('another commit', {allowEmpty: true});

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        const pushPullMenuView = controller.pushPullMenuView;
        const {pushButton, pullButton, message} = pushPullMenuView.refs;

        assert.equal(pushButton.textContent, 'Push (1)');
        assert.equal(pullButton.textContent, 'Pull (2)');

        pushButton.dispatchEvent(new MouseEvent('click'));
        await until('error message appears', () => /Push rejected/.test(message.innerHTML));

        pushButton.dispatchEvent(new MouseEvent('click', {metaKey: true}));
        repository.refresh();
        await controller.getLastModelDataRefreshPromise();

        assert.equal(pushButton.textContent, 'Push ');
        assert.equal(pullButton.textContent, 'Pull ');
      });
    });

    describe('fetch and pull commands', function() {
      it('fetches when github:fetch is triggered', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories('multiple-commits', {remoteAhead: true});
        const repository = await buildRepository(localRepoPath);

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        sinon.spy(repository, 'fetch');

        commandRegistry.dispatch(workspaceElement, 'github:fetch');

        assert.isTrue(repository.fetch.called);
      });

      it('pulls when github:pull is triggered', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories('multiple-commits', {remoteAhead: true});
        const repository = await buildRepository(localRepoPath);

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        sinon.spy(repository, 'pull');

        commandRegistry.dispatch(workspaceElement, 'github:pull');

        assert.isTrue(repository.pull.called);
      });

      it('pushes when github:push is triggered', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories();
        const repository = await buildRepository(localRepoPath);

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        sinon.spy(repository, 'push');

        commandRegistry.dispatch(workspaceElement, 'github:push');

        assert.isTrue(repository.push.calledWith('master', sinon.match({force: false})));
      });

      it('force pushes when github:force-push is triggered', async function() {
        const {localRepoPath} = await setUpLocalAndRemoteRepositories();
        const repository = await buildRepository(localRepoPath);

        const controller = new StatusBarTileController({workspace, repository, commandRegistry});
        await controller.getLastModelDataRefreshPromise();

        sinon.spy(repository, 'push');

        commandRegistry.dispatch(workspaceElement, 'github:force-push');

        assert.isTrue(repository.push.calledWith('master', sinon.match({force: true})));
      });
    });
  });

  describe('changed files', function() {
    it('shows the changed files count view when the repository data is loaded', async function() {
      const workdirPath = await cloneRepository('three-files');
      const repository = await buildRepository(workdirPath);

      const toggleGitPanel = sinon.spy();
      const controller = new StatusBarTileController({workspace, repository, toggleGitPanel, commandRegistry});
      await controller.getLastModelDataRefreshPromise();

      const changedFilesCountView = controller.refs.changedFilesCountView;

      assert.equal(changedFilesCountView.element.textContent, '0 files');

      fs.writeFileSync(path.join(workdirPath, 'a.txt'), 'a change\n');
      fs.unlinkSync(path.join(workdirPath, 'b.txt'));
      repository.refresh();
      await repository.stageFiles(['a.txt']);
      repository.refresh();
      await controller.getLastModelDataRefreshPromise();

      assert.equal(changedFilesCountView.element.textContent, '2 files');

      changedFilesCountView.element.click();
      assert(toggleGitPanel.calledOnce);
    });
  });
});
