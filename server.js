
/**
 * Module dependencies.
 */

var express = require('express')
    , app = express()
    , scale = require('./routes/scale')
    , server = require('http').createServer(app)
    , io = require('socket.io').listen(server)
    , db = require('./routes/database')
    , fs = require('fs')
    , exec = require('child_process').exec
    , path = require('path')
    , favicon = require('serve-favicon')
    , bodyParser = require('body-parser')
    , methodOverride = require('method-override')
    , basicAuth = require('basic-auth')
    , os = require('os');

var options = {
    ignorePaths: ["_gsdata_"],
    srcPath: '/mnt/nas',
    //srcPath: 'C:/Users/cjensen/Desktop/SrcImages',
    tgtPath: __dirname + '/photos',
    tgtWidth: 3840,
    tgtHeight: 2160,
    thumbPath: __dirname + '/thumbs',
    thumbWidth: 100,
    thumbHeight: 100,
    maxClip: 0.75,
    delay: 1000 * 60 * 60 * 12, // run every 12 hours
    uploadTmpPath: __dirname + '/uploads_tmp',
    uploadPath: __dirname + '/photos/uploads'
};

// list of images displayed
var displayHistory = []
    , temporarilyPaused = false
    , intervalId = null
    , _settings = {
        timeoutDelay: 60,
        keywords: [],
        minDate: null,
        maxDate: null,
        rating: null,
        showMetadata: false
    };

var total = 0;
var scaled = 0;
var complete = 0;
var failed = 0;
var skipped = 0;
var scalers = [];
var fork = require('child_process').fork;


var StartScalerProcess = function () {
    var scaler = fork(__dirname + '/routes/scaler.js');
    var pid = scaler.pid;
    console.log("started scaler process: " + pid)

    scaler.on('close', function (code, signal) {
        console.log("Scaler " + pid + " received close event. Code: " + code + "  Signal: " + signal);
    });

    scaler.on('error', function (err) {
        console.log("Scaler " + pid + " received error event.  Error: " + err);
    });

    scaler.on('exit', function (code, signal) {
        console.log("Scaler " + pid + " received exit event. Code: " + code + "  Signal: " + signal);
    });

    scaler.on('disconnect', function () {
        console.log("Scaler " + pid + " received disconnect event");
    });

    scaler.send({ Action: "Start", Options: options });

    scaler.on('message', function (data) {
        try {
            //console.log(JSON.stringify(data))
            if (data.Error) {
                failed++;
            }
            else if (data.Data != null) {
                var result = data.Data;
                scaled++;
                db.InsertFileInfo(result.Data, result.TgtFile, function (err) {
                    if (err) {
                        failed++;
                    }
                    else {
                        complete++;
                        console.log(new Date().toISOString() + " Pid: " + data.Pid + " " + data.File + " (complete: " + complete + ", scaled: " + scaled + ", total: " + total + ", failed: " + failed + ", skipped: " + skipped + ")");
                    }
                });
            } else {
                skipped++;
                //console.log(new Date().toISOString() + " skipping: " + data.File)
            }
        } catch (err) {
            failed++;
            console.log(err + " ");
        }
    });

    scalers.push(scaler);
}
var scalersToUse = 1;
if (os.cpus().length > 1)
    scalersToUse = 2;
//for (i = 0; i < os.cpus().length; i++) {
for (i = 0; i < scalersToUse; i++) {
    StartScalerProcess();
}

var Enum = function (path, action, callback) {
    var count = 0;
    scale.Enumerate(path, function (err, files) {
        if (err) {
            console.log(err);
        }
        else {
            files.forEach(function (file) {
                var index = (count++) % scalers.length;
                scalers[index].send({ Action: action, File: file });
            });

            console.log("found: " + files.length + " files in " + path)
        }
        callback(count)

        setTimeout(Enum, options.delay, path, action);
    });
};

Enum(options.srcPath, "Scale", function(count) { files = count});
Enum(options.tgtPath, "Verify", function(count) {});


var username = 'jensen', password = 'photos';

var auth = function (req, res, next) {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.sendStatus(401);
    };

    // bypass auth for local devices or empty username/password
    if ((username == "" && password == "") || req.ip.indexOf("127.0.0.") == 0)
        return next();

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        return unauthorized(res);
    };

    if (user.name === username && user.pass === password) {
        return next();
    } else {
        console.warn('login failure: [' + user.name + '][' + user.pass + ']');
        return unauthorized(res);
    };
};


app.set('port', /*process.env.PORT ||*/ 3000);
//  app.set('views', __dirname + '/views');
//  app.set('view engine', 'jade');
app.use(logger);
app.use(auth);
app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.use(bodyParser.json({ keepExtensions: true, uploadDir: options.uploadTmpPath }));
//app.use(bodyParser.urlencoded({ keepExtensions: true, uploadDir: options.uploadTmpPath }));
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(express.static(__dirname));

app.use(logErrors);
app.use(clientErrorHandler);
app.use(errorHandler);




function logger(req, res, next) {
    console.log('%s %s', req.method, req.url);
    //console.log(req.headers.authorization);
    //console.log(req.headers);

    next();
}

function logErrors(err, req, res, next) {
    console.log(err);
    console.error(err.stack);
    next(err);
}

function clientErrorHandler(err, req, res, next) {
    if (req.xhr) {
        res.send(500, { error: 'Server error' });
    } else {
        next(err);
    }
}

function errorHandler(err, req, res, next) {
    res.status(500);
    res.render('error', { error: err });
}




app.post('/upload', function (req, res, next) {

    var fileName = options.uploadTmpPath + '/' + req.files.file.name;
    fs.rename(req.files.file.path, fileName, function (err) {
        if (err) {
            next(err);
        } else {

            console.log('uploded: ' + fileName);
            res.send('success');

            var tgtFile = options.uploadPath + '/' + req.files.file.name;

            scale.addFile(fileName, tgtFile, options, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("added: " + fileName);

                    db.load(tgtFile, function (err, data) {
                        if (err) {
                            console.log('failed to load: ' + tgtFile);
                        } else {
                            showImage(data);
                        }
                    })
                }
            });
        }
    })
});

app.get('/', function (req, res) {
    res.sendFile('show.html', { root: __dirname });
});


app.post('/off', function (req, res) {
    exec("sudo /usr/bin/screen.sh off");
    res.send('off');
});

app.post('/on', function (req, res) {
    exec("sudo /usr/bin/screen.sh on");
    res.send('on');
});

app.get('/status', function (req, res) {
    exec("sudo /usr/bin/screen.sh status", function (err, stdout, stderr) {
        if (stdout.indexOf('TV is off') >= 0)
            res.send({ status: 'OFF' });
        else
            res.send({ status: 'ON' });
    });

});


app.get('/keywords', function (req, res, next) {
    var term = req.query.term;
    db.keywords(term, function (err, data) {
        if (err) {
            console.log("error getting keywords for: " + term + "  err: " + err);
            next(err);
        } else {
            //console.log("keywords result: " + data);
            res.jsonp(data);
        }
    });
});

app.get('/checksettings', function (req, res, next) {

    var settings = req.query.settings;
    db.checksettings(settings, function (err, data) {
        if (err) {
            console.log("error: " + err);
            next(err);
        } else {
            //console.log("checksettings result: " + data.count);
            res.jsonp(data);
        }
    });
});

db.daterange(function (err, data) {
    if (err) {
        console.log("error getting daterange: " + err);
    } else {

        _settings.minDate = data.min;// dont overwrite...
        _settings.maxDate = data.max;
    }
});


app.get('/settings', function (req, res) {
    res.jsonp(_settings);
});


app.post('/settings', function (req, res) {
    var settings = req.body.settings;
    var delay = settings.timeoutDelay;
    if (delay < 1)
        delay = 1;
    _settings.timeoutDelay = delay;
    _settings.keywords = settings.keywords;
    _settings.minDate = new Date(settings.minDate);
    _settings.maxDate = new Date(settings.maxDate);
    _settings.rating = settings.rating;
    _settings.showMetadata = settings.showMetadata;

    changeState(true, _settings.timeoutDelay);

    res.send('success');
});

app.get('/photodata', function (req, res, next) {

    var photo = req.query.photo;

    db.load(photo, function (err, data) {
        if (err) {
            next(err);
        } else {
            res.jsonp(data);
        }
    });
});

app.post('/photodata', function (req, res, next) {

    var photo = req.body.photo;
    var keywords = req.body.keywords;
    var enabled = req.body.enabled ? 1 : 0
    var rating = req.body.rating;
    if (rating == undefined)
        rating = null;

    db.update(__dirname + photo, enabled, keywords, rating, function (err) {
        if (err) {
            next(err);
        } else {
            res.send('success');
        }
    });

});


app.get('/thumbs', function (req, res, next) {
    var settings = req.query.settings;
    var limit = req.query.limit;
    var offset = req.query.offset;

    if (!settings)
        settings = _settings;

    db.thumbs(settings, limit, offset, function (err, data) {
        if (err) {
            next(err);
        } else {
            var thumdPath = options.thumbPath.replace(__dirname, '');
            for (var i = 0; i < data.length; i++)
                data[i] = data[i].replace(options.tgtPath, thumdPath);

            res.jsonp(data);
        }
    });
});


app.post('/thumbs', function (req, res, next) {
    var file = req.body.file;
    var pause = req.body.pause;

    db.load(file, function (err, data) {
        if (err)
            next(err);
        else {
            // if (pause) {
            changeState(false, 300);
            temporarilyPaused = true;
            // }

            showImage(data);
            res.send('success')
        }
    })


});


app.post('/disable', function (req, res, next) {

    var file = req.body.file;

    db.disable(file, function (err, data) {
        if (err) {
            next(err);
        } else {
            res.send('success')
        }
    })
});


var showImage = function (data) {
    if (data.file)
        data.file = data.file.replace(__dirname, '');

    if (temporarilyPaused) {
        temporarilyPaused = false;
        changeState(true, _settings.timeoutDelay);
    }

    data.showMetadata = _settings.showMetadata;
    data.timestamp = new Date();  // when it was served to clients

    while (displayHistory.length >= 1000)
        displayHistory.pop();  // remove from end
    displayHistory.unshift(data.file); // add to beginning

    // data.file = encodeUri(data.file);
    io.sockets.emit('show_image', data);
}

var showUrl = function (url) {

    if (temporarilyPaused) {
        temporarilyPaused = false;
        changeState(true, _settings.timeoutDelay);
    }

    var data = {};
    data.url = url
    data.timestamp = new Date();  // when it was served to clients


    // data.file = encodeUri(data.file);
    io.sockets.emit('show_url', data);
}

app.get('/history', function (req, res) {
    res.jsonp(displayHistory);
});


app.post('/play', function (req, res) {
    changeState(true, _settings.timeoutDelay);

    res.send('success');
});

app.post('/pause', function (req, res) {
    changeState(false);

    res.send('success');
});

var changeState = function (play, delay) {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    if (play)
        intervalId = setInterval(pushImage, delay * 1000, _settings);
}

server.listen(app.get('port'), function () {
    console.log("Express server listening on port " + app.get('port'));
});


var count = 0;
var pushImage = function (settings) {

    db.next(settings, function (err, data) {
        if (err)
            console.log(err);
        else {
            //console.log(data.file + "    " + options.tgtPath);
            showImage(data);
        }
    });

};


//io.set('log level', 2);

io.sockets.on('connection', function (socket) {
    console.log('************* connected: ' + socket.id);

    pushImage(_settings);
    changeState(true, _settings.timeoutDelay);

    socket.on('disconnect', function () {
        console.log("disconnected: " + socket.id + " ***************************");
    });

});