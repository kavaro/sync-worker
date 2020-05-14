import test from 'ava'
import sinon from 'sinon'
import { ClientMemoryDb, WorkerMemoryDb, ServerMemoryDb } from './MemoryDb'
import { TObj, UPSERT, DELETE } from './types'

test.beforeEach(t => {
  t.context = new ClientMemoryDb()
})

test('getId: should return document id', t => {
  const db = t.context as ClientMemoryDb<TObj>
  t.is(db.getId({ id: 'id1', name: 'NoName' }), 'id1')
})

test('isEqual: should return true when 2 document as the same', t => {
  const db = t.context as ClientMemoryDb<TObj>
  t.assert(db.isEqual({ id: 'id1' }, { id: 'id1' }))
  t.assert(!db.isEqual({ id: 'id1' }, { id: 'id2' }))
})

test('set: should assign unique id if not present', t => {
  const db = t.context as ClientMemoryDb<TObj>
  t.is(typeof db.set('c1', {}).id, 'string')
  t.is(db.set('c1', { id: 'id1'}).id, 'id1')
})

test('set: should store value', t => {
  const db = t.context as ClientMemoryDb<TObj>
  db.set('c1', { id: 'id1', name: 'NoName' })
  t.deepEqual(db.get('c1', 'id1'), { id: 'id1', name: 'NoName' })
})

test('set: should emit changed event when changed', t => {
  const db = t.context as ClientMemoryDb<TObj>
  const spy = sinon.spy()
  db.addListener('changed', spy)
  db.set('c1', { id: 'id1' })
  t.is(spy.callCount, 1)
  t.deepEqual(spy.getCall(0).args, [[
    { 
      type: 'upsert', 
      collection: 'c1', 
      doc: { id: 'id1' }, 
      patches: [
        { op: 'add', path: ['id'], value: 'id1' }
      ] 
    }
  ]] as any)
  db.set('c1', { id: 'id1' })
  t.is(spy.callCount, 1)
  db.set('c1', { id: 'id1', name: 'NoName' })
  t.deepEqual(spy.getCall(1).args, [[
    { 
      type: 'upsert', 
      collection: 'c1', 
      doc: { id: 'id1', name: 'NoName' }, 
      patches: [
        { op: 'add', path: ['name'], value: 'NoName' }
      ] 
    }
  ]] as any)
})

test('delete should remove doc', t => {
  const db = t.context as ClientMemoryDb<TObj>
  db.set('c1', { id: 'id1'})
  t.deepEqual(db.get('c1', 'id1'), { id: 'id1' })
  db.delete('c1', 'id1')
  t.is(db.get('c1', 'id1'), undefined)
})

test('delete should emit changed event when doc exists', t => {
  const db = t.context as ClientMemoryDb<TObj>
  const spy = sinon.spy()
  db.addListener('changed', spy)
  db.set('c1', { id: 'id1'})
  t.is(spy.callCount, 1)
  db.delete('c1', 'id1')
  t.is(spy.callCount, 2)
  t.deepEqual(spy.getCall(1).args, [[
    { 
      type: 'delete', 
      collection: 'c1', 
      doc: { id: 'id1' }
    }
  ]] as any)
})

test('worker.save: should return promise', t => {
  const db = new WorkerMemoryDb()
  const promise = db.save()
  t.assert(typeof promise.then === 'function')
  t.assert(typeof promise.catch === 'function')
  t.assert(typeof promise.finally === 'function')
})

test('server.save: should return promise', t => {
  const db = new ServerMemoryDb()
  db.set('c1', { id: 'id2' })
  const promise = db.save([
    { 
      type: 'upsert' as UPSERT, 
      collection: 'c1', 
      doc: { id: 'id1', name: 'NoName' }, 
      patches: [{
        op: 'add',
        path: ['name'],
        value: 'NoName'
      }] 
    },
    { 
      type: 'delete' as DELETE, 
      collection: 'c1', 
      doc: { id: 'id2' } 
    },
  ])
  t.deepEqual(db.get('c1', 'id1'), { id: 'id1', name: 'NoName' })
  t.is(db.get('c1', 'id2'), undefined)
  t.assert(typeof promise.then === 'function')
  t.assert(typeof promise.catch === 'function')
  t.assert(typeof promise.finally === 'function')
})

test('clean: should return clean doc and default to noop', t => {
  const clientDb = new ClientMemoryDb()
  t.deepEqual(clientDb.clean({ id: 'id1' }), { id: 'id1' })
  const workerDb = new WorkerMemoryDb()
  t.deepEqual(workerDb.clean({ id: 'id1' }), { id: 'id1' })
})

test('ids: should return all ids in collection', t => {
  const workerDb = new WorkerMemoryDb()
  workerDb.set('c1', { id: 'id1' })
  workerDb.set('c1', { id: 'id2' })
  workerDb.set('c2', { id: 'id3' })
  t.deepEqual(workerDb.ids('c1'), ['id1', 'id2'])
})