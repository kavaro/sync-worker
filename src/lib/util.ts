import {
  TDbBase,
  TDbChangeType
} from './types'

export function applyDelete<TCollection, TDoc, TId>(
  db: TDbBase<TCollection, TDoc, TId>,
  collection: TCollection,
  id: TId
): TDoc | null {
  const oldDoc = db.get(collection, id)
  if (oldDoc) {
    db.delete(collection, id)
    return oldDoc
  }
  return null
}

export function applySet<TCollection, TDoc, TId>(
  db: TDbBase<TCollection, TDoc, TId>,
  collection: TCollection,
  doc: TDoc
): TDoc | null {
  const id: TId = db.getId(doc)
  const oldDoc = db.get(collection, id)
  if (!oldDoc || !db.isEqual(doc, oldDoc)) {
    db.set(collection, doc)
    return doc
  }
  return null
}

export function applyChange<TCollection, TDoc, TId>(
  db: TDbBase<TCollection, TDoc, TId>,
  type: TDbChangeType,
  collection: TCollection,
  doc: TDoc
): TDoc | null {
  if (type === 'delete') {
    return applyDelete(db, collection, db.getId(doc))
  }
  return applySet(db, collection, doc)
}