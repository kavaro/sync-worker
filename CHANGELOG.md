# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.5.0](https://github.com/kavaro/sync-worker/compare/v0.4.0...v0.5.0) (2020-05-15)


### improvement

* simplify type declarations, options object, setId, clear for SyncWorker ([e41fca9](https://github.com/kavaro/sync-worker/commit/e41fca9))


### BREAKING CHANGES

* Nearly all type declarations have changes, Syncworker options object, workerDb
setId and async clear methods



## [0.4.0](https://github.com/kavaro/sync-worker/compare/v0.3.0...v0.4.0) (2020-05-14)


### Features

* add compact method ([ec2a555](https://github.com/kavaro/sync-worker/commit/ec2a555))


### BREAKING CHANGES

* compact method has been added, server delete cannot override client upsert



## [0.3.0](https://github.com/kavaro/sync-worker/compare/v0.2.1...v0.3.0) (2020-05-14)


### improvement

* add clean method to TDbBase ([db9a7f6](https://github.com/kavaro/sync-worker/commit/db9a7f6))


### BREAKING CHANGES

* Requires database to implement new 'clean' method.



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
