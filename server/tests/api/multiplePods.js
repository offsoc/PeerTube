'use strict'

const async = require('async')
const chai = require('chai')
const expect = chai.expect
const pathUtils = require('path')

const utils = require('./utils')
const webtorrent = require(pathUtils.join(__dirname, '../../lib/webtorrent'))
webtorrent.silent = true

describe('Test multiple pods', function () {
  let apps = []
  let urls = []
  const to_remove = []

  before(function (done) {
    this.timeout(30000)

    async.series([
      // Run servers
      function (next) {
        utils.flushAndRunMultipleServers(3, function (apps_run, urls_run) {
          apps = apps_run
          urls = urls_run
          next()
        })
      },
      // The second pod make friend with the third
      function (next) {
        utils.makeFriends(urls[1], next)
      },
      // Wait for the request between pods
      function (next) {
        setTimeout(next, 10000)
      },
      // Pod 1 make friends too
      function (next) {
        utils.makeFriends(urls[0], next)
      },
      function (next) {
        webtorrent.create({ host: 'client', port: '1' }, next)
      }
    ], done)
  })

  it('Should not have videos for all pods', function (done) {
    async.each(urls, function (url, callback) {
      utils.getVideosList(url, function (err, res) {
        if (err) throw err

        expect(res.body).to.be.an('array')
        expect(res.body.length).to.equal(0)

        callback()
      })
    }, done)
  })

  describe('Should upload the video and propagate on each pod', function () {
    it('Should upload the video on pod 1 and propagate on each pod', function (done) {
      this.timeout(15000)

      async.series([
        function (next) {
          utils.uploadVideo(urls[0], 'my super name for pod 1', 'my super description for pod 1', 'video_short1.webm', next)
        },
        function (next) {
          setTimeout(next, 11000)
        }],
        // All pods should have this video
        function (err) {
          if (err) throw err

          async.each(urls, function (url, callback) {
            let base_magnet = null

            utils.getVideosList(url, function (err, res) {
              if (err) throw err

              const videos = res.body
              expect(videos).to.be.an('array')
              expect(videos.length).to.equal(1)
              const video = videos[0]
              expect(video.name).to.equal('my super name for pod 1')
              expect(video.description).to.equal('my super description for pod 1')
              expect(video.podUrl).to.equal('http://localhost:9001')
              expect(video.magnetUri).to.exist

              // All pods should have the same magnet Uri
              if (base_magnet === null) {
                base_magnet = video.magnetUri
              } else {
                expect(video.magnetUri).to.equal.magnetUri
              }

              callback()
            })
          }, done)
        }
      )
    })

    it('Should upload the video on pod 2 and propagate on each pod', function (done) {
      this.timeout(15000)

      async.series([
        function (next) {
          utils.uploadVideo(urls[1], 'my super name for pod 2', 'my super description for pod 2', 'video_short2.webm', next)
        },
        function (next) {
          setTimeout(next, 11000)
        }],
        // All pods should have this video
        function (err) {
          if (err) throw err

          async.each(urls, function (url, callback) {
            let base_magnet = null

            utils.getVideosList(url, function (err, res) {
              if (err) throw err

              const videos = res.body
              expect(videos).to.be.an('array')
              expect(videos.length).to.equal(2)
              const video = videos[1]
              expect(video.name).to.equal('my super name for pod 2')
              expect(video.description).to.equal('my super description for pod 2')
              expect(video.podUrl).to.equal('http://localhost:9002')
              expect(video.magnetUri).to.exist

              // All pods should have the same magnet Uri
              if (base_magnet === null) {
                base_magnet = video.magnetUri
              } else {
                expect(video.magnetUri).to.equal.magnetUri
              }

              callback()
            })
          }, done)
        }
      )
    })

    it('Should upload two videos on pod 3 and propagate on each pod', function (done) {
      this.timeout(30000)

      async.series([
        function (next) {
          utils.uploadVideo(urls[2], 'my super name for pod 3', 'my super description for pod 3', 'video_short3.webm', next)
        },
        function (next) {
          utils.uploadVideo(urls[2], 'my super name for pod 3-2', 'my super description for pod 3-2', 'video_short.webm', next)
        },
        function (next) {
          setTimeout(next, 22000)
        }],
        function (err) {
          if (err) throw err

          let base_magnet = null
          // All pods should have this video
          async.each(urls, function (url, callback) {
            utils.getVideosList(url, function (err, res) {
              if (err) throw err

              const videos = res.body
              expect(videos).to.be.an('array')
              expect(videos.length).to.equal(4)
              let video = videos[2]
              expect(video.name).to.equal('my super name for pod 3')
              expect(video.description).to.equal('my super description for pod 3')
              expect(video.podUrl).to.equal('http://localhost:9003')
              expect(video.magnetUri).to.exist

              video = videos[3]
              expect(video.name).to.equal('my super name for pod 3-2')
              expect(video.description).to.equal('my super description for pod 3-2')
              expect(video.podUrl).to.equal('http://localhost:9003')
              expect(video.magnetUri).to.exist

              // All pods should have the same magnet Uri
              if (base_magnet === null) {
                base_magnet = video.magnetUri
              } else {
                expect(video.magnetUri).to.equal.magnetUri
              }

              callback()
            })
          }, done)
        }
      )
    })
  })

  describe('Should seed the uploaded video', function () {
    it('Should add the file 1 by asking pod 3', function (done) {
      // Yes, this could be long
      this.timeout(200000)

      utils.getVideosList(urls[2], function (err, res) {
        if (err) throw err

        const video = res.body[0]
        to_remove.push(res.body[2].id)
        to_remove.push(res.body[3].id)

        webtorrent.add(video.magnetUri, function (torrent) {
          expect(torrent.files).to.exist
          expect(torrent.files.length).to.equal(1)
          expect(torrent.files[0].path).to.exist.and.to.not.equal('')

          done()
        })
      })
    })

    it('Should add the file 2 by asking pod 1', function (done) {
      // Yes, this could be long
      this.timeout(200000)

      utils.getVideosList(urls[0], function (err, res) {
        if (err) throw err

        const video = res.body[1]

        webtorrent.add(video.magnetUri, function (torrent) {
          expect(torrent.files).to.exist
          expect(torrent.files.length).to.equal(1)
          expect(torrent.files[0].path).to.exist.and.to.not.equal('')

          done()
        })
      })
    })

    it('Should add the file 3 by asking pod 2', function (done) {
      // Yes, this could be long
      this.timeout(200000)

      utils.getVideosList(urls[1], function (err, res) {
        if (err) throw err

        const video = res.body[2]

        webtorrent.add(video.magnetUri, function (torrent) {
          expect(torrent.files).to.exist
          expect(torrent.files.length).to.equal(1)
          expect(torrent.files[0].path).to.exist.and.to.not.equal('')

          done()
        })
      })
    })

    it('Should add the file 3-2 by asking pod 1', function (done) {
      // Yes, this could be long
      this.timeout(200000)

      utils.getVideosList(urls[0], function (err, res) {
        if (err) throw err

        const video = res.body[3]

        webtorrent.add(video.magnetUri, function (torrent) {
          expect(torrent.files).to.exist
          expect(torrent.files.length).to.equal(1)
          expect(torrent.files[0].path).to.exist.and.to.not.equal('')

          done()
        })
      })
    })

    it('Should remove the file 3 and 3-2 by asking pod 3', function (done) {
      this.timeout(15000)

      async.series([
        function (next) {
          utils.removeVideo(urls[2], to_remove[0], next)
        },
        function (next) {
          utils.removeVideo(urls[2], to_remove[1], next)
        }],
        function (err) {
          if (err) throw err
          setTimeout(done, 11000)
        }
      )
    })

    it('Should have videos 1 and 3 on each pod', function (done) {
      async.each(urls, function (url, callback) {
        utils.getVideosList(url, function (err, res) {
          if (err) throw err

          const videos = res.body
          expect(videos).to.be.an('array')
          expect(videos.length).to.equal(2)
          expect(videos[0].id).not.to.equal(videos[1].id)
          expect(videos[0].id).not.to.equal(to_remove[0])
          expect(videos[1].id).not.to.equal(to_remove[0])
          expect(videos[0].id).not.to.equal(to_remove[1])
          expect(videos[1].id).not.to.equal(to_remove[1])

          callback()
        })
      }, done)
    })
  })

  after(function (done) {
    apps.forEach(function (app) {
      process.kill(-app.pid)
    })
    process.kill(-webtorrent.app.pid)

    // Keep the logs if the test failed
    if (this.ok) {
      utils.flushTests(done)
    } else {
      done()
    }
  })
})
