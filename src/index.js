#!/usr/bin/env node
/* @flow */

import { MongoClient } from 'mongodb'
import logger from 'winston'

import { dumpAllNamesFile, processAllNames, createSearchIndex } from './indexer.js'
import { getConfig } from './config'

import minimist from 'minimist'

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

function getMongoClient(config) {
  return MongoClient.connect(config.mongoConnection)
}

function runSearchIndex(config) {
  return getMongoClient(config)
    .then(client => {
      const searchDB = client.db('search_db_next')
      const searchCache = client.db('search_cache_next')
      return Promise.all([searchDB.dropDatabase(),
                          searchCache.dropDatabase()])
        .then(() => client)
    })
    .then(client => {
      const searchDB = client.db('search_db_next')
      const searchCache = client.db('search_cache_next')
      const namespaceCollection = searchDB.collection('namespace')
      const profileCollection = searchDB.collection('profile_data')
      /* these need to be updated... */
      const searchProfiles = searchDB.collection('profiles')
      const peopleCache = searchCache.collection('people_cache')
      const twitterCache = searchCache.collection('twitter_cache')
      const usernameCache = searchCache.collection('username_cache')
      return processAllNames(namespaceCollection, profileCollection,
                             { useFiles: { namespace: '/var/blockstack-search/blockchain_data.json',
                                           profiles: '/var/blockstack-search/profile_data.json' } })
        .then(() => createSearchIndex(namespaceCollection, searchProfiles,
                                      peopleCache, twitterCache, usernameCache))
        .then(() => logger.info('Finished Indexing!'))
        .then(() => Promise.all([client.db('search_db_prior').dropDatabase(), client.db('search_cache_prior').dropDatabase()]))
        .then(() => Promise.all([searchDB.admin().command({ copydb: 1, fromdb: 'search_db', todb: 'search_db_prior' }),
                                 searchCache.admin().command({ copydb: 1, fromdb: 'search_cache', todb: 'search_cache_prior' })]))
        .then(() => Promise.all([client.db('search_db').dropDatabase(), client.db('search_cache').dropDatabase()]))
        .then(() => Promise.all([searchDB.admin().command({copydb: 1, fromdb: 'search_db_next', todb: 'search_db' }),
                                 searchCache.admin().command({ copydb: 1, fromdb: 'search_cache_next', todb: 'search_cache' })]))
        .then(() => client.close())
    })
}

function runFetchToFiles(asService, config) {
  let running = false
  dumpAllNamesFile(config.profilesFile, config.namesFile)
    .then(() => {
      logger.info('Finished indexing!')
      if (asService) {
        setInterval(() => {
          if (!running) {
            running = true
            logger.info('Starting indexing')
            dumpAllNamesFile(config.profilesFile, config.namesFile)
              .catch((err) => logger.error(err))
              .then(() => {
                logger.info('Finished indexing!')
                running = false
              })
          } else {
            logger.info('Already indexing, skipping indexing operation.')
          }
        }, 60 * 1000 * config.minutesBetweenIndex)
      }
    })
    .catch((err) => logger.error(err))
}

function main() {
  const config = getConfig()
  const args = minimist(process.argv.slice(2),
                        { boolean: ['-d'] })

  const asService = args.d

  const command = args._[0]
  if (command === 'fetch-to-json') {
    return runFetchToFiles(asService, config)
  } else if (command === 'index') {
    return runSearchIndex(config)
  }

}

main()
