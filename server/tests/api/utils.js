'use strict'

const child_process = require('child_process')
const exec = child_process.exec
const fork = child_process.fork
const pathUtils = require('path')
const request = require('supertest')

const testUtils = {
  flushTests: flushTests,
  getFriendsList: getFriendsList,
  getVideo: getVideo,
  getVideosList: getVideosList,
  makeFriends: makeFriends,
  quitFriends: quitFriends,
  removeVideo: removeVideo,
  flushAndRunMultipleServers: flushAndRunMultipleServers,
  runServer: runServer,
  searchVideo: searchVideo,
  uploadVideo: uploadVideo
}

// ---------------------- Export functions --------------------

function flushTests (callback) {
  exec(pathUtils.join(__dirname, '../../../bin/clean_test.sh'), callback)
}

function getFriendsList (url, end) {
  const path = '/api/v1/pods/'

  request(url)
    .get(path)
    .set('Accept', 'application/json')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(end)
}

function getVideo (url, id, end) {
  const path = '/api/v1/videos/' + id

  request(url)
    .get(path)
    .set('Accept', 'application/json')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(end)
}

function getVideosList (url, end) {
  const path = '/api/v1/videos'

  request(url)
    .get(path)
    .set('Accept', 'application/json')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(end)
}

function makeFriends (url, expected_status, callback) {
  if (!callback) {
    callback = expected_status
    expected_status = 204
  }

  const path = '/api/v1/pods/makefriends'

  // The first pod make friend with the third
  request(url)
    .get(path)
    .set('Accept', 'application/json')
    .expect(expected_status)
    .end(function (err, res) {
      if (err) throw err

      // Wait for the request between pods
      setTimeout(callback, 1000)
    })
}

function quitFriends (url, callback) {
  const path = '/api/v1/pods/quitfriends'

  // The first pod make friend with the third
  request(url)
    .get(path)
    .set('Accept', 'application/json')
    .expect(204)
    .end(function (err, res) {
      if (err) throw err

      // Wait for the request between pods
      setTimeout(callback, 1000)
    })
}

function removeVideo (url, id, end) {
  const path = '/api/v1/videos'

  request(url)
    .delete(path + '/' + id)
    .set('Accept', 'application/json')
    .expect(204)
    .end(end)
}

function flushAndRunMultipleServers (total_servers, serversRun) {
  let apps = []
  let urls = []
  let i = 0

  function anotherServerDone (number, app, url) {
    apps[number - 1] = app
    urls[number - 1] = url
    i++
    if (i === total_servers) {
      serversRun(apps, urls)
    }
  }

  flushTests(function () {
    for (let j = 1; j <= total_servers; j++) {
      // For the virtual buffer
      setTimeout(function () {
        runServer(j, function (app, url) {
          anotherServerDone(j, app, url)
        })
      }, 1000 * j)
    }
  })
}

function runServer (number, callback) {
  const port = 9000 + number
  const server_run_string = {
    'Connected to mongodb': false,
    'Server listening on port': false
  }

  // Share the environment
  const env = Object.create(process.env)
  env.NODE_ENV = 'test'
  env.NODE_APP_INSTANCE = number
  const options = {
    silent: true,
    env: env,
    detached: true
  }

  const app = fork(pathUtils.join(__dirname, '../../../server.js'), [], options)
  app.stdout.on('data', function onStdout (data) {
    let dont_continue = false
    // Check if all required sentences are here
    for (const key of Object.keys(server_run_string)) {
      if (data.toString().indexOf(key) !== -1) server_run_string[key] = true
      if (server_run_string[key] === false) dont_continue = true
    }

    // If no, there is maybe one thing not already initialized (mongodb...)
    if (dont_continue === true) return

    app.stdout.removeListener('data', onStdout)
    callback(app, 'http://localhost:' + port)
  })
}

function searchVideo (url, search, end) {
  const path = '/api/v1/videos'

  request(url)
    .get(path + '/search/' + search)
    .set('Accept', 'application/json')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(end)
}

function uploadVideo (url, name, description, fixture, end) {
  const path = '/api/v1/videos'

  request(url)
    .post(path)
    .set('Accept', 'application/json')
    .field('name', name)
    .field('description', description)
    .attach('input_video', pathUtils.join(__dirname, 'fixtures', fixture))
    .expect(204)
    .end(end)
}

// ---------------------------------------------------------------------------

module.exports = testUtils
