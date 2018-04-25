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
      const searchDB = client.db('search_db_two')
      const searchCache = client.db('search_cache_two')
      const namespaceCollection = searchDB.collection('namespace')
      const profileCollection = searchDB.collection('profile_data')
      /* these need to be updated... */
      const searchProfiles = searchDB.collection('profiles')
      const peopleCache = searchCache.collection('people_cache')
      const twitterCache = searchCache.collection('twitter_cache')
      const usernameCache = searchCache.collection('username_cache')
      return processAllNames(namespaceCollection, profileCollection)
        .then(() => createSearchIndex(namespaceCollection, searchProfiles,
                                      peopleCache, twitterCache, usernameCache))
        .then(() => logger.info('Finished Indexing!'))
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
