/*
 * scale images.
 */

var fs = require('fs')
    , path = require('path')
    , exec = require('child_process').exec;
  //  , sync = require('sync')
//, db = require('./database');

/*db.initialize(function (err) {
    if (err)
        console.log("Error initializing database: " + err);
    else
        console.log("Sql database initialized");
});*/

String.prototype.endsWith = function (str) { return (this.match(str + "$") == str) }
String.prototype.escape = function (str) { return (this.replace(/'/g, "''")) }


Array.prototype.unique = function () {
    return this.filter(function (value, index, array) {
        return array.indexOf(value) === index;
    });
}


var filesToProcess = [];

exports.Enumerate = function (dir, callback) {
    var files = [];
    walk(dir, null, function (err) {
        if (err)
            console.log("Enumerate err: " + err);
        callback(err, files);
    }, function (file, notUsed, callback2) {
        if (isImageFile(file))
            files.push(file);
        callback2();
    });
}


var isImageFile = function (path) {
    var lPath = path.toLowerCase();
    return lPath.endsWith(".jpg");// || lPath.endsWith(".nef") || lPath.endsWith(".cr2");
}

var shouldIgnore = function (options, path) {
    for (var i = 0; i < options.ignorePaths.length; i++) {
        if (path.indexOf('/' + options.ignorePaths[i] + '/') != -1) {
            return true;
        }
    }
    return false;
}

var generateThumbs = function (file, options, callback) {

    if (shouldIgnore(options, file)) {
        console.log('skipping: ' + file);
        return callback(null);
    }

    if (options.EnqueueFiles == true) {
        //var tgtFile = file.replace(options.srcPath, options.tgtPath);
        console.log('queued: ' + file)
        filesToProcess.push(file);

        return callback(null);
    } else {
        var tgtFile = file.replace(options.srcPath, options.tgtPath);
        generateThumbs2(file, tgtFile, options, callback);
    }
}

var parseKeywords = function (obj) {
    //console.log(obj);
    var vals = [];
    if (obj != null) {
        if (obj instanceof Array)
            vals = obj;
        else
            vals = obj.split(';');
    }

    var res = [];
    for (var i = 0; i < vals.length; i++) {
        var r = vals[i].trim();
        if (r != '') {
            var r2 = r.split(',');
            for (var j = 0; j < r2.length; j++) {
                var r3 = r2[j].trim();
                if (r3 != '')
                    res.push(r3);
            }
        }
    }
    //console.log(res);
    return res;
}

var parseDate = function (date, file) {
    var d;
    try {
        if (date.indexOf(':') == 4) {  // '2008:05:07 14:24:39-08'
            var s = date.split(' ');
            var s1 = s[0].split(':');
            var s2 = s[1].split(':');

            var offset = 0;
            var s3 = s2[2].split('-');
            if (s3.length > 1) {
                s2[2] = s3[0];
                offset = -s3[1];
            } else {
                s3 = s2[2].split('+');
                if (s3.length > 1) {
                    s2[2] = s3[0];
                    offset = s3[1];
                }
            }

            //console.log(s1[0] + " " + s1[1]+ " " + s1[2] + " " + s2[0] + " " + s2[1] + " " + s2[2] + " "+ offset);
            d = new Date(s1[0], s1[1] - 1, s1[2], s2[0], s2[1], s2[2]);
        } else {
            d = new Date(date);
        }
    }
    catch (e) { }

    //console.log("in: " + date + "   out: " + d + " " + file)
    return d;
}



function copyFile(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function (err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function (err) {
        done(err);
    });
    wr.on("close", function (ex) {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            if (err) {
                cb(err);
            } else {
                fs.stat(source, function (err, stat) {
                    if (err) {
                        cb(err);
                    } else {
                        fs.utimes(target, stat.atime, stat.mtime, function (err) {
                            cb(err);
                            cbCalled = true;
                        });
                    }
                })
            }
        }
    }
}

var walk = function (dir, options, done, callback) {

    fs.readdir(dir, function (err, list) {

        if (err)
            return done(err);

        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file)
                return done(null);

            file = dir + '/' + file;
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    // console.log('walking: ' + file);
                    walk(file, options, function (err) {
                        next();
                    }, callback);
                } else {
                    callback(file, options, function (err) {
                        next();
                    });
                }
            });
        })();
    });
};

function ensureDirExists(dir, mode, callback) {
    var existsFunction = fs.exists || path.exists;

    existsFunction(dir, function (exists) {
        if (exists) return callback(null);

        var current = path.resolve(dir);
        var parent = path.dirname(current);

        ensureDirExists(parent, mode, function (err) {
            if (err)
                return callback(err);

            fs.mkdir(current, mode, function (err) {
                if (err && err.code != 'EEXIST')
                    return callback(err);

                callback(null);
            });

        });
    });
}