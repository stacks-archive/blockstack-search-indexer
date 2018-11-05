# Overview

This project builds a search index from public Blockstack profile
information. It use `blockstack.js` and the Blockstack RESTful
API to perform profile lookups, and perform lookups of the entire
set of names respectively.

Currently, this project only support _building_ the search index. To
that end, it supports two modes --- the first is directly placing the
index information in a mongodb instance, the second is dumping the
index into two JSON files (`blockchain_data.json` and
`profile_data.json`) --- the JSON files are compatible with the format
expected by blockstack-core/api's [basic_index.py](https://github.com/blockstack/blockstack-core/blob/master/api/search/basic_index.py).

# Operation

To run the indexer in a one-off indexing operation with JSON dumps:

```bash
$ npm run build && node lib/index.js fetch-to-json
```

Logging information is outputted to stderr/stdoutr, so I recommend
redirecting that to a logfile.

The option `-d` will cause the indexer to run an indexing batch every
_N_ minutes -- the batch frequency can be configured in a
`config.json` file, or via an environment variable.

You can also run the indexer as a direct-to-mongo index builder, with the
option:
```
node lib/index.js index
```

# Running with a local Blockstack node

We recommend point the search service at your own Blockstack node -- that
way you can be sure that you aren't relying on someone else's service (and
trusting their responses!)

You can find documentation on running a core
node [here](https://github.com/blockstack/blockstack-core#installing-blockstack-core),
but a few simple docker commands can get you started.

Starting your node:
```
$ docker run -it -p 127.0.0.1:6270:6270 -v /home/<user>/blockstack-core:/root/.blockstack quay.io/blockstack/blockstack-core:master
```

Notice, that command mounts a folder on the host machine to store blockstack-core
data. The first time you run that command, your node will synchronize from a snapshot
and fill that folder with data. On subsequent runs, your node will simply boot from
the data in that folder, and download any updates since the last time it started.

Once the node finishes synchronizing (you'll see ` End indexing ` in the docker container's log),
you can run your search service, pointed at `http://localhost:6270`

### Configuration

The following environment variables will control the operation of
the indexer:

```
BSK_SEARCH_CONFIG -- the path to a config.json file
BSK_SEARCH_API_URL -- the API URL to use for blockstack RESTful API calls
  (default: http://localhost:6270)
BSK_SEARCH_MONGO_CONNECTION -- mongodb connection URI to use if running
  in mongodb mode (i.e., node lib/index.js index)
BSK_SEARCH_INDEX_EVERY -- if running with `-d`, the indexer will not exit
  after a single index, but instead try to index every N minutes. This sets
  N (default: 120)
BSK_SEARCH_NAMES_FILE -- if running in `fetch-to-json` mode, this specifies
  the names JSON file to write to (default: /var/blockstack-search/blockchain_data.json)
BSK_SEARCH_PROFILES_FILE -- if running in `fetch-to-json` mode, this specifies
  the profile data JSON file to write to
  (default: /var/blockstack-search/profile_data.json)
```
