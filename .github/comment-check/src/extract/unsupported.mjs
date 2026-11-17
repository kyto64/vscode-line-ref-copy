export class UnsupportedLanguageError extends Error {
  constructor(language) {
    super(`コメント検査に未対応の言語: ${language}`);
    this.name = 'UnsupportedLanguageError';
    this.language = language;
  }
}
