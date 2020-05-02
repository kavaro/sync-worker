import {
  TDbBase,
  TDbChangeType
} from './types'

export function applyDelete<TCollection, TDoc, TId>(db: TDbBase<TCollection, TDoc, TId>, collection: TCollection, id: TId) {
  const oldDoc = db.get(collection, id)
  if (oldDoc) {
    db.delete(collection, id)
    return oldDoc
  }
  return false
}

export function applySet<TCollection, TDoc, TId>(db: TDbBase<TCollection, TDoc, TId>, collection: TCollection, doc: TDoc) {
  const id: TId = db.getId(doc)
  const oldDoc = db.get(collection, id)
  if (!oldDoc || !db.isEqual(doc, oldDoc)) {
    db.set(collection, doc)
    return true
  }
  return false
}

export function applyChange<TCollection, TDoc, TId>(
  db: TDbBase<TCollection, TDoc, TId>, 
  type: TDbChangeType, 
  collection: TCollection, 
  doc: TDoc
) {
  if (type === 'delete') {
    return applyDelete(db, collection, db.getId(doc))
  }
  return applySet(db, collection, doc)
}