/*
 * scale images.
 */

var fs = require('fs')
    , path = require('path')
    , exec = require('child_process').exec
    , db = require('./database')
    , gm = require('gm')
    , util = require('util')
    , exiftool = require('node-exiftool');

String.prototype.endsWith = function (str) { return (this.match(str + "$") == str) }
String.prototype.escape = function (str) { return (this.replace(/'/g, "''")) }
Array.prototype.unique = function () {
    return this.filter(function (value, index, array) {
        return array.indexOf(value) === index;
    });
}

var filesToScale = [];
var filesToVerify = [];

var isImageFile = function (path) {
    var lPath = path.toLowerCase();
    return lPath.endsWith(".jpg");// || lPath.endsWith(".nef") || lPath.endsWith(".cr2");
}

const ep = new exiftool.ExiftoolProcess();

process.on('exit', function (code) {
    var exitMsg = 'Process exited with code ' + code;
    console.log(exitMsg);
    ep2.close();
    // log exitMsg synchronously
});

var generateThumbs2 = async function (file, tgtFile, options, callback) {

    try {
        if (isImageFile(file)) {
            var start = new Date();

            var ticket = await EnsureDirExistsAsync(path.dirname(tgtFile), 0777 & (~process.umask()));
            var thumbFile = tgtFile.replace(options.tgtPath, options.thumbPath);
            var ticket2 = await EnsureDirExistsAsync(path.dirname(thumbFile), 0777 & (~process.umask()));

            //console.log(process.pid + " found2: " + file);
            var sStat = fs.statSync(file);
            var tStat = null;

            try {
                tStat = fs.statSync(tgtFile);
                //tStat = fs.stat.sync(null, tgtFile);
            }
            catch (err) {
                //console.log(process.pid + " " + file + " err: " + err)
                if (err.code != 'ENOENT') {
                    //throw (err);
                    callback(null);
                    return;
                }
            }

            if (tStat == null || sStat.mtime.getTime() != tStat.mtime.getTime()) {
                var pre = new Date() - start;
                start = new Date();

                var data = await ReadFileInfoAsync(file);
                //  console.log("exif:" + JSON.stringify(data))
                data.Telemetry = {};
                data.Telemetry.Start = pre;
                data.Telemetry.ReadFileInfo = new Date() - start;
                start = new Date();

                await ScaleAsync(data, tgtFile, options);
                data.Telemetry.Scale = new Date() - start;
                start = new Date();

                var relPath = tgtFile.replace(options.tgtPath, '');
                start = new Date();

                fs.utimesSync(tgtFile, sStat.atime, sStat.mtime);
                fs.utimesSync(thumbFile, sStat.atime, sStat.mtime);
                data.Telemetry.SetDestFileTimestamp = new Date() - start;

                callback(null, { Data: data, TgtFile: tgtFile });
            } 
        } 
        
        callback(null);
    }
    catch (err) {
        callback(err);
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

var ReadFileInfo = function (file, callback) {

    ep
        .open()
        .then(() => ep.readMetadata(file, ['FileModifyDate', 'Title', 'Rating', 'Common', 'Lens', 'Subject', 'XPKeywords', 'Keywords', 'ImageHeight', 'ImageWidth']/* ['-File:all']*/))
        .then((json) => {
            json = json.data[0];
            json.Tags = parseKeywords(json.Keywords).concat(parseKeywords(json.XPKeywords)).concat(parseKeywords(json.Subject)).unique();
            // parse dateTaken
            json.DateTaken = parseDate(json.DateTimeOriginal, file);
            if (json.DateTaken == null)
                json.DateTaken = parseDate(json.FileModifyDate, file);

            //        ep.close();
            callback(null, json);
        }/*, (err) => {
            ep.close()
            console.log("caught1: " + err);
            callback(err);
        }*/)
        .then(() => ep.close())
        .catch((err) => {
            ep.close();
            console.log("caught2: " + err);
            callback(err);
        });
}

var scale = function (data, outfile, options, callback) {

    var thumbFile = outfile.replace(options.tgtPath, options.thumbPath);
    var gmCommand;

    if (data.ImageWidth > options.tgtWidth || data.ImageHeight > options.tgtHeight) {

        var h = 0, w = 0, clipW = options.tgtWidth, clipH = options.tgtHeight;
        var srcAspect = data.ImageWidth / data.ImageHeight;
        if (srcAspect > (options.tgtWidth / options.tgtHeight)) {
            h = options.tgtHeight;
            w = Math.round(data.ImageWidth / (data.ImageHeight / options.tgtHeight));

            if ((options.tgtWidth / w) < options.maxClip) {
                var ratio = options.maxClip / (options.tgtWidth / w);
                clipH = h = Math.round(h / ratio);
                w = Math.round(w / ratio);
            }
        } else {
            w = options.tgtWidth;
            h = Math.round(data.ImageHeight / (data.ImageWidth / options.tgtWidth));

            if ((options.tgtHeight / h) < options.maxClip) {
                var ratio = options.maxClip / (options.tgtHeight / h);
                clipW = w = Math.round(w / ratio);
                h = Math.round(h / ratio);
            }
        }

        var cropX = Math.round((w - clipW) / 2);
        var cropY = Math.round((h - clipH) / 2);

        try {
            gm(data.SourceFile)
                .quality(75)
                .resize(w, h, '!')
                .crop(clipW, clipH, cropX, cropY)
                .noProfile()
                .write(outfile, function (err) {
                    if (err) {
                        callback(err);
                    } else {
                        try {
                            gm(data.SourceFile)
                                .resize(options.thumbWidth, options.thumbHeight)
                                .noProfile()
                                .write(thumbFile, callback);
                        }
                        catch (err) {
                            callback(err);
                        }
                    }
                })
        }
        catch (err) {
            callback(err);
        }

        data.DestWidth = clipW;
        data.DestHeight = clipH;

    } else {
        data.DestWidth = data.ImageWidth;
        data.DestHeight = data.ImageHeight;

        try {
            gm(data.SourceFile)
                .noProfile()
                .write(outfile, function (err) {
                    if (err) {
                        callback(err);
                    } else {
                        try {
                            gm(data.SourceFile)
                                .resize(options.thumbWidth, options.thumbHeight)
                                .noProfile()
                                .write(thumbFile, callback);
                        }
                        catch (err) {
                            console.log(err);
                            callback(err);
                        }
                    }
                })
        }
        catch (err) {
            callback(err);
        }
    }
}

var ensureDirExists = function (dir, mode, callback) {
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

var ProcessFiles = async function (options, callback) {

    var file = filesToScale.shift();
    while (file) {

        var tgtFile = file.replace(options.srcPath, options.tgtPath);

        try {
            var res = await GenerateThumbsAsync(file, tgtFile, options);
            callback(null, file, res);
        }
        catch (err) {
            callback(err);
        }

        file = filesToScale.shift();
    }

    file = filesToVerify.shift();
    while (file) {
        
        try {
            var res = await VerifyAsync(file, options);
            callback(null, file, res);
        }
        catch (err) {
            callback(err);
        }

        file = filesToVerify.shift();
    }

    // no files to process - try again later
    console.log("Finished processing files, sleep 10s")
    setTimeout(ProcessFiles, 10000, options, callback);
}

var shouldIgnore = function(options, path) {
    for (var i=0;i<options.ignorePaths.length; i++) {
        if (path.indexOf('/' + options.ignorePaths[i] + '/') != -1) {
            return true;
        }
    }
    return false;
}


var cleanThumbs = function (tgtFile, options, callback) {
    var existsFunction = fs.exists || path.exists;

    db.getSourcePathFromTargetPath(tgtFile, function (err, srcPath) {
        if (err) {
            callback(err);
        } else if (srcPath == null) {
            // no entry for this target file in the database so delete it
            console.log("deleting (not in db): " + tgtFile);
            fs.unlink(tgtFile, callback);

            // also delete thumbnail
            var thumbPath = tgtFile.replace(options.tgtPath, options.thumbPath);
            fs.unlink(thumbPath, function (err) {
                if (err)
                    console.log("failed to delete thumbnail: " + thumbPath + " err: " + err);
                else
                    console.log("deleted (not in db): " + thumbPath);
            });
        } else {
            // Make sure source exists, if not clean up db and delete target
            existsFunction(srcPath, function (exists) {
                if (exists && !shouldIgnore(options, srcPath)) {
                    // source file exists so nothing to do
                    callback();
                } else {
                    // Cannot access source file or it should be ignored
                    // we don't want to delete everything when the network is not assessible
                    // so we'll only delete if we can access the src directory
                    existsFunction(options.srcPath, function (srcPathExists) {
                        if (srcPathExists) {

                            // source file doesn't exist clean db and delete tgt and thumb
                            db.deleteFileInfo(tgtFile, function (err) {

                                console.log("deleting (src doesn't exist): " + tgtFile);
                                fs.unlink(tgtFile, callback);

                                // also delete thumbnails
                                var thumbPath = tgtFile.replace(options.tgtPath, options.thumbPath);
                                fs.unlink(thumbPath, function (err) {
                                    if (err)
                                        console.log("failed to delete thumbnail: " + thumbPath + " err: " + err);
                                    else
                                        console.log("deleted (src doesn't exist): " + thumbPath);
                                });
                            })
                        } else {
                            console.log('Not deleting because network may be down: ' + tgtFile);
                            //throw new Error('SrcPath is not accessible');
                            callback();
                        }
                    });
                }
            });
        }
    });
}

EnsureDirExistsAsync = util.promisify(ensureDirExists);
GenerateThumbsAsync = util.promisify(generateThumbs2);
ReadFileInfoAsync = util.promisify(ReadFileInfo);
ScaleAsync = util.promisify(scale);
VerifyAsync = util.promisify(cleanThumbs);


process.on('message', function (data) {
    if (data.Action == "Start") {

        ProcessFiles(data.Options, function (err, file, data) {
            process.send({ Error: err, File: file, Pid: process.pid, Data: data });
        });
    }
    else if (data.Action == "Scale") {
        filesToScale.push(data.File);
    }
    else if (data.Action == "Verify") {
        filesToVerify.push(data.File);
    }
});
