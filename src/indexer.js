/* @flow */
import { lookupProfile, config as bskConfig } from 'blockstack'
import logger from 'winston'
import { Collection } from 'mongodb'
import fs from 'fs'

type IndexEntry = { key: string, value: Object }

function _getAllNames(page: number, priorNames: Array<string>): Promise<Array<string>> {
  const blockstackAPIUrl = bskConfig.network.blockstackAPIUrl
  const fetchUrl = `${blockstackAPIUrl}/v1/names?page=${page}`

  if (page % 20 === 0) {
    logger.info(`Fetched ${page} domain pages...`)
  }

  return fetch(fetchUrl)
    .then(resp => resp.json())
    .then(names => {
      logger.debug('Fetched name page')
      if (names.length > 0) {
        names.forEach(x => priorNames.push(x))
        return _getAllNames(page + 1, priorNames)
      } else {
        return priorNames
      }
    })
}

function _getAllSubdomains(page: number, priorNames: Array<string>): Promise<Array<string>> {
  const blockstackAPIUrl = bskConfig.network.blockstackAPIUrl
  const fetchUrl = `${blockstackAPIUrl}/v1/subdomains?page=${page}`

  if (page % 20 === 0) {
    logger.info(`Fetched ${page} subdomain pages...`)
  }

  return fetch(fetchUrl)
    .then(resp => resp.json())
    .then(names => {
      logger.debug('Fetched subdomain page')
      if (names.length > 0) {
        names.forEach(x => priorNames.push(x))
        return _getAllSubdomains(page + 1, priorNames)
      } else {
        return priorNames
      }
    })
}

function getAllNames(): Promise<Array<string>> {
  return _getAllNames(0, [])
}

function getAllSubdomains(): Promise<Array<string>> {
  return _getAllSubdomains(0, [])
}

function cleanEntry(entry: Object): Object {
  if (!entry) {
    return entry
  }
  Object.keys(entry)
    .forEach((key) => {
      const value = entry[key]
      if (typeof(value) === 'object') {
        cleanEntry(value)
      }
      if (key.includes('.')) {
        const newKey = key.replace('.', '_')
        entry[newKey] = value
        delete entry[key]
        key = newKey
      }
      if (key.startsWith('$')) {
        entry['_' + key.slice(1)] =  value
        delete entry[key]
      }
    })

  return entry
}

function batchify<T>(input: Array<T>, batchSize: number = 50): Array<Array<T>> {
  const output = []
  let currentBatch = []
  for (let i = 0; i < input.length; i++) {
    currentBatch.push(input[i])
    if (currentBatch.length >= batchSize) {
      output.push(currentBatch)
      currentBatch = []
    }
  }
  if (currentBatch.length > 0) {
    output.push(currentBatch)
  }
  return output
}

function lookupProfileWithTimeout(name: string, timeoutSecs: number): Promise<Object> {
  return Promise.race([
    new Promise((resolve, reject) =>
                setTimeout(() => reject(new Error('lookupProfile timed out')),
                           timeoutSecs*1000)),
    lookupProfile(name)])
}

function fetchNames(names: Array<string>) : Promise<Array<?IndexEntry>> {
  return Promise.all(names.map(
    name =>
      lookupProfileWithTimeout(name, 30)
      .then(profile =>
            ({ key: name,
               value: cleanEntry(Object.assign({}, profile)) }))
      .catch((err) => {
        logger.debug(`Failed looking up profile for ${name}`)
        logger.debug(err)
        return null
      })))
}

export function dumpAllNamesFile(profilesFile: string, namesFile: string): Promise<void> {
  const profileEntries = []
  let allNames
  let errorCount = 0
  return Promise.all([getAllNames(), getAllSubdomains()])
    .then(([allDomains, allSubdomains]) => {
      const totalLength = allDomains.length + allSubdomains.length
      logger.info(`Fetching ${totalLength} entries`)
      allNames = allDomains
      allSubdomains.forEach( x => allNames.push(x) )
      return allNames
    })
    .then(names => batchify(names, 50))
    .then(batches => {
      let promiseIterate = Promise.resolve([])
      batches.forEach((batch, batchIx) => {
        promiseIterate = promiseIterate
          .then(results => {
            results.forEach( result => {
              if (result) {
                profileEntries.push({ profile: result.value,
                                      fqu: result.key })
              } else {
                errorCount += 1
              }
            } )
            if (batchIx % 10 === 0) {
              logger.info(`Fetched ${batchIx} batches of 50`)
            }
          })
          .then(() => fetchNames(batch))
      })
      return promiseIterate
    })
    .then(() => {
      logger.info(`Total errored lookups: ${errorCount}`)
      logger.info('Finished batching. Writing files...')
      fs.writeFileSync(profilesFile, JSON.stringify(profileEntries, null, 2))
      fs.writeFileSync(namesFile, JSON.stringify(allNames, null, 2))
    })
}

export function processAllNames(namespaceCollection: Collection,
                                profileCollection: Collection): Promise<void> {
  let indexEntries
  let allNames
  return Promise.all([getAllNames(), getAllSubdomains()])
    .then(([allDomains, allSubdomains]) => {
      const totalLength = allDomains.length + allSubdomains.length
      logger.info(`Fetching ${totalLength} entries`)
      allNames = allDomains
      allSubdomains.forEach( x => allNames.push(x) )
      return allNames
    })
    .then(names => fetchNames(allNames))
    .then(results => {
      results.forEach( result => {
        if (result) {
          indexEntries.push(result)
        }
      } )
    })
    .then(() => Promise.all(indexEntries.map(entry => profileCollection.save(entry))))
    .then(() => Promise.all(indexEntries.map(
      entry => {
        let username = entry.key
        if (username.endsWith('.id')) {
          username = username.slice(0, -3)
        }
        const newEntry = { username,
                           profile: entry.value }
        return namespaceCollection.save(newEntry)
      })))
    .then(() => {})
}

export function createSearchIndex(namespaceCollection: Collection, searchProfiles: Collection,
                                  peopleCache: Collection, twitterCache: Collection,
                                  usernameCache: Collection): Promise<void> {
  const cursor = namespaceCollection.find()
  const peopleNames = []
  const twitterHandles = []
  const usernames = []
  return new Promise((resolve, reject) => {
    cursor.forEach(
      (user) => {
        let openbazaar = null
        let name = null
        let twitterHandle = null
        let profile = user.profile
        if (profile.hasOwnProperty('account')) {
          profile.account.forEach((account) => {
            if (account.service === 'openbazaar') {
              openbazaar = account.identifier
            } else if (account.service === 'twitter') {
              twitterHandle = account.identifier
            }
          })
        }
        if (profile.hasOwnProperty('name')) {
          name = profile.name
          if (name.hasOwnProperty('formatted')) {
            name = name.formatted
          }
          name = name.toLocaleLowerCase()
        }

        if (name) {
          peopleNames.push(name)
        }
        if (twitterHandle) {
          twitterHandles.push(twitterHandle)
        }
        if (user.username) {
          usernames.push(user.username)
        }

        const entry = { name, profile, openbazaar,
                        twitter_handle: twitterHandle,
                        username: user.username }
        searchProfiles.save(entry)
      },
      (err) => {
        if (err) {
          reject(err)
        } else {
          resolve(err)
        }
      })
  })
    .then(() => {
      const peopleNamesSet = new Set(peopleNames)
      const twitterHandlesSet = new Set(twitterHandles)
      const usernamesSet = new Set(usernames)
      const peopleNamesEntry = { name: [...peopleNamesSet] }
      const twitterHandlesEntry = { 'twitter_handle': [...twitterHandlesSet] }
      const usernamesEntry = { username: [...usernamesSet] }
      return peopleCache.save(peopleNamesEntry)
        .then(() => twitterCache.save(twitterHandlesEntry))
        .then(() => usernameCache.save(usernamesEntry))
    })
}
