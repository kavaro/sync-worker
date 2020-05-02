import test from 'ava'
import OptimisticChangeIds from './OptimisticChangeIds'
import { TIdFactory } from './types'

function createIdFactory(...ids: string[]): () => string {
  return () => ids.shift()
}

test('add should return changeId', t => {
  const idFactory: TIdFactory<string> = createIdFactory('ca', 'cb', 'cc', 'cd')
  const changeIds = new OptimisticChangeIds<string, string>(idFactory)
  t.is(changeIds.add('a'), 'ca')
})

test('add should map docId to changeId', t => {
  const idFactory: TIdFactory<string> = createIdFactory('ca', 'cb', 'cc', 'cd')
  const changeIds = new OptimisticChangeIds<string, string>(idFactory)
  const ca = changeIds.add('a')
  const cb = changeIds.add('b')
  // @ts-ignore
  t.is(changeIds.ids.get('a'), ca)
  // @ts-ignore
  t.is(changeIds.ids.get('b'), cb)
  // @ts-ignore
  t.is(Array.from(changeIds.ids.keys()).length, 2)
})

test('remote should return true when there is no optimistic change', t => {
  const idFactory: TIdFactory<string> = createIdFactory('ca', 'cb', 'cc', 'cd')
  const changeIds = new OptimisticChangeIds<string, string>(idFactory)
  changeIds.add('a')
  t.is(changeIds.remove('b'), true)
})

test('remote should return true when the optimistic change has the same changeId', t => {
  const idFactory: TIdFactory<string> = createIdFactory('ca', 'cb', 'cc', 'cd')
  const changeIds = new OptimisticChangeIds<string, string>(idFactory)
  changeIds.add('a')
  t.is(changeIds.remove('a', 'ca'), true)
  changeIds.add('a')
  t.is(changeIds.remove('a', 'cc'), false)
  t.is(changeIds.remove('a'), false)
})
