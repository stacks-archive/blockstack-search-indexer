import { config as bskConfig  } from 'blockstack'
import winston from 'winston'
import fs from 'fs'
import http from 'http'

const configDefaults = {
  winstonConsoleTransport: {
      level: 'info',
      handleExceptions: false,
      timestamp: true,
      stringify: true,
      colorize: true,
      json: false
  },
  maxSimultaneousFetches: 75,
  blockstackAPIUrl: 'http://localhost:6270',
  // used if indexing directly into mongo
  mongoConnection: 'mongodb://localhost:27017',
  // used if fetching data into json files (legacy support)
  namesFile: '/var/blockstack-search/blockchain_data.json',
  profilesFile: '/var/blockstack-search/profile_data.json',
  minutesBetweenIndex: 120,
  pagesToFetch: -1
}


export function getConfig() {
  const config = Object.assign({}, configDefaults)
  if (process.env.BSK_SEARCH_CONFIG) {
    const configFile = process.env.BSK_SEARCH_CONFIG
    Object.assign(config, JSON.parse(fs.readFileSync(configFile)))
  }
  if (process.env.BSK_SEARCH_API_URL) {
    config.blockstackAPIUrl = process.env.BSK_SEARCH_API_URL
  }
  if (process.env.BSK_SEARCH_MONGO_CONNECTION) {
    config.mongoConnection = process.env.BSK_SEARCH_MONGO_CONNECTION
  }
  if (process.env.BSK_SEARCH_INDEX_EVERY) {
    config.minutesBetweenIndex = parseFloat(process.env.BSK_SEARCH_INDEX_EVERY)
  }
  if (process.env.BSK_SEARCH_NAMES_FILE) {
    config.namesFile = process.env.BSK_SEARCH_NAMES_FILE
  }
  if (process.env.BSK_SEARCH_PROFILES_FILE) {
    config.profilesFile = process.env.BSK_SEARCH_PROFILES_FILE
  }
  if (process.env.BSK_SEARCH_PAGES_TO_FETCH) {
    config.pagesToFetch = parseInt(process.env.BSK_SEARCH_PAGES_TO_FETCH)
  }

  winston.configure({ transports: [
    new winston.transports.Console(config.winstonConsoleTransport)
  ] })

  http.globalAgent.maxSockets = config.maxSimultaneousFetches

  bskConfig.network.blockstackAPIUrl = config.blockstackAPIUrl
  bskConfig.logLevel = 'debug'

  return config
}
