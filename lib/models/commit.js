const UNBORN = Symbol('unborn');

export default class Commit {
  static createUnborn() {
    return new Commit({unbornRef: UNBORN});
  }

  constructor({sha, authorEmail, coAuthors, authorDate, message, body, unbornRef}) {
    this.sha = sha;
    this.authorEmail = authorEmail;
    this.coAuthors = coAuthors || [];
    this.authorDate = authorDate;
    this.message = message;
    this.body = body;
    this.unbornRef = unbornRef === UNBORN;
  }

  getSha() {
    return this.sha;
  }

  getAuthorEmail() {
    return this.authorEmail;
  }

  getAuthorDate() {
    return this.authorDate;
  }

  getCoAuthorEmails() {
    return this.coAuthors;
  }

  getMessage() {
    return this.message;
  }

  getBody() {
    return this.body;
  }

  isUnbornRef() {
    return this.unbornRef;
  }

  isPresent() {
    return true;
  }
}

export const nullCommit = {
  getSha() {
    return '';
  },

  getMessage() {
    return '';
  },

  isUnbornRef() {
    return false;
  },

  isPresent() {
    return false;
  },
};
