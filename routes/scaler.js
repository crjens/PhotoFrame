/*
 * scale images.
 */

var fs = require('fs')
    , path = require('path')
    , exec = require('child_process').exec
    , sync = require('sync')
    , db = require('./database')
    , gm = require('gm')
    , exif = require('exiftool');
/*
db.initialize(function (err) {
    if (err)
        console.log("Sql initializing database: " + err);
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

var isImageFile = function (path) {
    var lPath = path.toLowerCase();
    return lPath.endsWith(".jpg");// || lPath.endsWith(".nef") || lPath.endsWith(".cr2");
}

var generateThumbs2 = function (file, tgtFile, options, callback) {

    sync(function () {
        try {
            if (isImageFile(file)) {
                var start = new Date();
                //console.log('found: ' + file);            
                //var tgtFile = file.replace(options.srcPath, options.tgtPath);
                //console.log(tgtFile)
                var ticket = ensureDirExists.future(null, path.dirname(tgtFile), 0777 & (~process.umask()));
                var thumbFile = tgtFile.replace(options.tgtPath, options.thumbPath);
                var ticket2 = ensureDirExists.future(null, path.dirname(thumbFile), 0777 & (~process.umask()));

                var sStat = fs.stat.future(null, file);
                var tStat = null;

                try {
                    tStat = fs.stat.sync(null, tgtFile);
                }
                catch (err) {

                    if (err.code != 'ENOENT') {
                        //throw (err);
                        return null;
                    }
                }

                if (tStat == null || sStat.result.mtime.getTime() != tStat.mtime.getTime()) {
                    //console.log('starting: ' + tgtFile)
                    var pre = new Date() - start;
                    start = new Date();

                    var data = ReadFileInfo.sync(null, file);
                    data.Telemetry = {};
                    data.Telemetry.Start = pre;
                    data.Telemetry.ReadFileInfo = new Date() - start;
                    start = new Date();

                    var x = ticket.result;  // make sure directory exists
                    x = ticket2.result;
                    scale.sync(null, data, tgtFile, options);

                    data.Telemetry.Scale = new Date() - start;
                    start = new Date();

                    var relPath = tgtFile.replace(options.tgtPath, '');
                    //            options.thumbs.insert(relPath);
                    data.Telemetry.Insert = new Date() - start;
                    start = new Date();

                    //db.InsertFileInfo.sync(null, data, tgtFile);
                    data.Telemetry.InsertFileInfo = new Date() - start;
                    start = new Date();

                    fs.utimes.sync(null, tgtFile, sStat.result.atime, sStat.result.mtime);
                    fs.utimes.sync(null, thumbFile, sStat.result.atime, sStat.result.mtime);
                    data.Telemetry.SetDestFileTimestamp = new Date() - start;

                    return { Data: data, TgtFile: tgtFile };
                    //console.log(data.Telemetry);
                } else {
                    //console.log('not processing: ' + tgtFile) 
                }
            }

        }
        catch (err) {
            //    //console.log("error: " + err);
        }

        return null;
    }, callback)
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
    /*
        sync(function () {
    
            //console.log("exiftool -FileModifyDate -Title -Rating -Common -Lens -Subject -XPKeywords -Keywords -ImageHeight -ImageWidth -j \"" + file + "\"")
            var res = exec.sync(null, "exiftool -FileModifyDate -Title -Rating -Common -LensID -Subject -XPKeywords -Keywords -ImageHeight -ImageWidth -Make -CameraModel -ExposureTime -FocalLength -ISOSpeed -FStop -j \"" + file + "\"");
            //console.log(res)
            var json = eval(res)[0];
            json.Tags = parseKeywords(json.Keywords).concat(parseKeywords(json.XPKeywords)).concat(parseKeywords(json.Subject)).unique();
            //console.log('parsed')
            // parse dateTaken
            json.DateTaken = parseDate(json.DateTimeOriginal, file);
            if (json.DateTaken == null) {
                json.DateTaken = parseDate(json.FileModifyDate, file);
            }
    
            return json;
        }, callback)
    */

    fs.readFile(file, function (err, data) {
        if (err)
            callback(err);
        else {
            exif.metadata(data, function (err, metadata) {
                //console.log(metadata);
                if (err)
                    callback(err);
                else {
                    var json = eval(metadata);
                    json.Tags = parseKeywords(json.Keywords).concat(parseKeywords(json.XPKeywords)).concat(parseKeywords(json.Subject)).unique();
                    //console.log('parsed')
                    // parse dateTaken
                    json.DateTaken = parseDate(json.DateTimeOriginal, file);
                    if (json.DateTaken == null) {
                        json.DateTaken = parseDate(json.FileModifyDate, file);
                    }
                    callback(null, json);
                }
            });
        }
    });


}

var scale = function (data, outfile, options, callback) {
    //console.log('scale')

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

        //gmCommand = 'gm convert -quality 75 "' + data.SourceFile + '" -resize ' + w + 'x' + h + '! -crop ' + clipW + 'x' + clipH + '+' + cropX + '+' + cropY + ' +profile "*" -write "' + outfile;
        //gmCommand += '" -resize ' + options.thumbWidth + 'x' + options.thumbHeight + ' +profile "*" "' + thumbFile + '"';

        gm(data.SourceFile)
            .quality(75)
            .resize(w, h, '!')
            .crop(clipW, clipH, cropX, cropY)
            .noProfile()
            .write(outfile, function (err) {
                if (err) {
                    callback(err);
                } else {
                    gm(data.SourceFile)
                        .resize(options.thumbWidth, options.thumbHeight)
                        .noProfile()
                        .write(thumbFile, callback);
                }
            })

        data.DestWidth = clipW;
        data.DestHeight = clipH;

    } else {
        data.DestWidth = data.ImageWidth;
        data.DestHeight = data.ImageHeight;

        //gmCommand = 'gm convert "' + data.SourceFile + '" +profile "*" -write "' + outfile + '" -resize ' + options.thumbWidth + 'x' + options.thumbHeight + ' +profile "*" "' + thumbFile + '"';

        gm(data.SourceFile)
            .noProfile()
            .write(outfile, function (err) {
                if (err) {
                    callback(err);
                } else {
                    gm(data.SourceFile)
                        .resize(options.thumbWidth, options.thumbHeight)
                        .noProfile()
                        .write(thumbFile, callback);
                }
            })

    }



    /*
    exec(gmCommand, function (err) {
        callback(err);
    });
    */
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

var ProcessFiles = function (options, callback) {

    var file = filesToProcess.shift();
    if (file) {
        var tgtFile = file.replace(options.srcPath, options.tgtPath);
        generateThumbs2(file, tgtFile, options, function (err, result) {
            callback(err, file, result);
            ProcessFiles(options, callback);  // process next file
        });
    } else {
        // no files to process - try again later
        setTimeout(ProcessFiles, 10000, options, callback);
    }
}

process.on('message', function (data) {
    if (data.Action == "Start") {

        ProcessFiles(data.Options, function (err, file, data) {
            process.send({ Error: err, File: file, Pid: process.pid, Data: data });
        });
    }
    else if (data.Action == "Push") {
        filesToProcess.push(data.File);
    }
});
