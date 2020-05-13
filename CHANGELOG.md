# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.2.1](https://github.com/kavaro/sync-worker/compare/v0.2.0...v0.2.1) (2020-05-13)



## [0.2.0](https://github.com/kavaro/sync-worker/compare/v0.1.0...v0.2.0) (2020-05-13)


### Bug Fixes

* improvde code coverage ([8e12217](https://github.com/kavaro/sync-worker/commit/8e12217))


### improvement

* change return types of TDbBase.delete and TDbBase.set to void ([83c71fd](https://github.com/kavaro/sync-worker/commit/83c71fd))


### BREAKING CHANGES

* Returnn types of TDbBase set and delete have been modified to be void



## 0.1.0 (2020-05-02)


### Bug Fixes

* fix ts-lint errors, fix tslint.json ([c7b1aa9](https://github.com/kavaro/sync-worker/commit/c7b1aa9))
* increase coverage of syncWorker.ts ([c139fe0](https://github.com/kavaro/sync-worker/commit/c139fe0))
* remove prettier ([6078f1b](https://github.com/kavaro/sync-worker/commit/6078f1b))
* switch from yarn to npm ([0be80df](https://github.com/kavaro/sync-worker/commit/0be80df))


### BREAKING CHANGES

* SyncWorker now accepts server database instead of save function, SyncClient and
SyncWorker make distinction between clientDb, workerDb and serverDb types, SyncClient and SyncWorker
add changed listener to clientDb and serverDb respectively
