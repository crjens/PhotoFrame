/*
 * scale images.
 */

var fs = require('fs')
    , path = require('path')
    , exec = require('child_process').exec
//    , gm = require('gm')
    , sync = require('sync')
    , db = require('./database');

db.initialize(function (err) { 
    if (err)
        console.log("Sql initializing database: " + err);
    else
        console.log("Sql database initialized") ;    
});

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}

String.prototype.endsWith = function(str) { return (this.match(str+"$")==str) }
String.prototype.escape = function(str) { return (this.replace(/'/g, "''")) }

/*
Array.prototype.insertOrRemove = function(find, insert) {
  var h = this.length - 1, l=-1, m;
  while (h-l > 1) {
    if (this[m=h+l >> 1] < find)
      l = m;
    else
      h = m;
  }

  if (insert) {
    if (this[h] != find)
      this.splice(h, 0, find);  // insert at index h
  } else { 
    if (this[h] == find)
      this.splice(h,1);  // remove
  }
  //return this[h] != find ? insert ? h : -1 : h;
};

Array.prototype.insert = function(value) {
  this.insertOrRemove(value, true);
};

Array.prototype.remove = function(value) {
  this.insertOrRemove(value, false);
};

Array.prototype.getRandom = function() {
  var len = this.length;
  if (len == 0)
     return null;
  var rand = Math.floor(Math.random() * len);
console.log("len: " +len + "  rand: " + rand + "  file: " + this[rand]);
  return this[rand];
};
*/

Array.prototype.unique = function() {
  return this.filter(function(value, index, array) {
    return array.indexOf(value) === index;
  });
}

exports.addFile = function(srcFile, tgtFile, options, callback) {
    generateThumbs2(srcFile, tgtFile, options, callback);
}


var filesToProcess = [];

exports.sync3 = function(options) {
    
    var file = filesToProcess.shift();
    if (file) {

        // original source file path
        var srcFile = file.replace(options.uploadTmpPath, options.srcPath);
        // target file path
        var tgtFile = file.replace(options.uploadTmpPath, options.tgtPath);
        // thumbnail file path
        var thumbFile = file.replace(options.uploadTmpPath, options.thumbPath);
            
        processFile(file, srcFile, tgtFile, thumbFile, options, function(err) {
            if (err)
                console.log(err);
                
            exports.sync3(options);  // process next file
        });
    } else {
        // no files to process - try again later
        setTimeout(exports.sync3, 10000, options);
    }
    
}

var processFile = function(file, srcFile, tgtFile, thumbFile, options, callback) {
    sync(function() {
        try {

            console.log('processing: ' + file);            

            var ticket = ensureDirExists.future(null, path.dirname(tgtFile), 777 & (~process.umask()));
            var ticket2 = ensureDirExists.future(null, path.dirname(thumbFile), 777 & (~process.umask()));
            var sStat = fs.stat.future(null, file);

            var data = ReadFileInfo.sync(null, file);

            var x = ticket.result;  // make sure directory exists
            x = ticket2.result;

            scale.sync(null, data, tgtFile, options);
	
            data.SourceFile = srcFile;
	        db.InsertFileInfo.sync(null, data, tgtFile);

            fs.utimes.sync(null, tgtFile, sStat.result.atime, sStat.result.mtime);
            fs.utimes.sync(null, thumbFile, sStat.result.atime, sStat.result.mtime);

            fs.unlink.sync(null, file);
        } 
        catch (err) {
            console.log("error: " + err);
        }
        }, callback)
}

exports.sync2 = function (options) {

    console.log("Called Exports.Sync2");

    var existsFunction = fs.exists || path.exists;

    existsFunction(options.srcPath, function(srcPathExists) {
        if (srcPathExists) {
            
            exports.sync3(options);

            // look for new file first then clean up missing files
            console.log("Searching for new files...")
            walk(options.srcPath, options, function(err) {
                if (err)
                    console.log("generateThumbs err: " + err);

                console.log("finished new files - cleaning up missing files...")
                //walk(options.tgtPath, options, callback, cleanThumbs);    
            }, function (file, options, callback) {

                needsProcessing(file, options, function(err, result) {
                    if (err) {
                        console.log(err);
                        callback(err);
                    } else if (result) {
                        // copy file to temp directory
                        var tmpFile = file.replace(options.srcPath, options.uploadTmpPath);
                        copyToTempDir(file, tmpFile, function(err) {
                            if (err) {
                                console.log(err);
                                callback(err);
                            } else {
                                //console.log("copied to temp: " + tmpFile);
                                filesToProcess.push(tmpFile);

                                if (filesToProcess.length < 5) {
                                    callback();
                                } else {
                                    waitTillDirectoryContainsFewerThanCountFiles(options.uploadTmpPath, 3, function (err, files) {
                                        if (err) 
                                            console.log(err);

                                        callback(err);
                                    });
                                }
                            }
                        });
                   } else {
                       // file does not need processing
                       callback();
                   }
                });

                
            });       
        } else {
            console.log('SrcPath is not accessible');
        }
    });
};

var waitTillDirectoryContainsFewerThanCountFiles = function(dir, count, callback) {
    var id = setInterval(function () { 
        enumerateAllFilesInDir(dir, function(err, files) {
            if (err) {
                callback(err);
            } else {
                if (files.length < count) {
                    clearInterval(id);
                    callback(null, files);
                } else { 
                    console.log('waiting... ' + files.length);
                }
            }
        });
    }, 5000);
}

var enumerateAllFilesInDir = function(dir, callback) {
    var files = [];
    walk(dir, null, function(err) {
        if (err)
            console.log("enumerateAllFilesInDir err: " + err);
        callback(err, files);
    }, function (file, notUsed, callback2) {

       files.push(file);
       callback2();
    });
}


var needsProcessing = function(file, options, callback) {
    // TODO - could also check to make sure file is registered in db
    if (isImageFile(file)) {
    
        var tgtFile = file.replace(options.srcPath, options.tgtPath);
        var thumbFile = file.replace(options.srcPath, options.thumbPath);
        
        sync(function() {
            var srcStat = fs.stat.future(null, file);
            var tgtStat = fs.stat.future(null, tgtFile);
            var thumbStat = fs.stat.future(null, thumbFile);
        
            var srcTime = null, tgtTime = null, thumbTime = null, result = true;
            try {
                srcTime = srcStat.result.mtime.getTime();
            }
            catch (err) {
                console.log('source does not exist: ' + file);
                callback(err); // failed to read source file time
            }

            try {
                tgtTime = tgtStat.result.mtime.getTime();
                thumbTime = tgtStat.result.mtime.getTime();
            }
            catch (err) {
                if (err.code != 'ENOENT'){
                    callback(err);
                } else {
                     //console.log('target or thumbnail file does not exist');
                }
            }

            // if file modified times match we don't need to process the file
            if (srcTime ==  tgtTime && srcTime == thumbTime) 
                result = false;
            
            //console.log('srcTime: ' + srcTime + ' tgtTime: ' + tgtTime + ' thumbTime: ' + thumbTime + ' result: ' + result);

            callback(null, result);
        });

    } else {
        // not an image file
        callback(null, false);
    }
}

var copyToTempDir = function (src, dest, callback) {
    
    ensureDirExists(path.dirname(dest), 777, function(err) {
        if (err) {
            console.log(err);
            callback(err);
        } else {
            copyFile(src, dest, function(err) {
                if (err) {
                    console.log(err);
                    callback(err);
                } else {
                    // File copied successfully
                    callback();
                }
            });
        }
    });
}

exports.sync = function (options) {

    console.log("Called Exports.Sync");
    SyncRepeat(options);
};

var SyncRepeat = function(options) {
    try {
        SyncFiles(options, function(err){
            if (err)
                console.log("error syncing files: " + err);

            setTimeout(SyncRepeat, options.delay, options);
        });
    }
    catch (e) {
        console.log('Error syncing files: ' + e);
        setTimeout(SyncRepeat, options.delay, options);
    }
}

var SyncFiles = function(options, callback)
{
    if (callback == null)
        callback = function() {};

    var existsFunction = fs.exists || path.exists;

    existsFunction(options.srcPath, function(srcPathExists) {
        if (srcPathExists) {
            
            // look for new file first then clean up missing files
            console.log("Searching for new files...")
            walk(options.srcPath, options, function(err) {
                if (err)
                    console.log("generateThumbs err: " + err);
                console.log("finished new files - cleaning up missing files...")
                walk(options.tgtPath, options, callback, cleanThumbs);    
            }, generateThumbs);
                    
        } else {
            console.log('SrcPath is not accessible');
            //throw new Error('SrcPath is not accessible');
            callback();
        }
    });
 
    

    
};

var updateDestSize = function(callback) {

    db.getNext(function(err, file) {
        if (err == null && file != null) {
       
            ReadFileInfo(file, function(err, data) {
        
                if (err == null && data.ImageWidth > 0) {
                    db.updateDestSize(file, data, callback);
                } else {
                    if (err)
                        console.log(err)
                    else
                        console.log("width=0  " + file);

                    updateDestSize(callback);
                }
            });
        } else {
            callback(null);
        }
    });
    
}

var cleanThumbs = function(tgtFile, options, callback) {
    var existsFunction = fs.exists || path.exists;

    db.getSourcePathFromTargetPath(tgtFile, function(err, srcPath) {
        if (err) {
            callback(err);
        } else if (srcPath == null) {
            // no entry for this target file in the database so delete it
            console.log("deleting (not in db): " + tgtFile);
            fs.unlink(tgtFile, callback);  

            // also delete thumbnail
            var thumbPath = tgtFile.replace(options.tgtPath, options.thumbPath);
            fs.unlink(thumbPath, function(err) {
                if (err)
                    console.log("failed to delete thumbnail: " + thumbPath + " err: " + err);
                else 
                    console.log("deleted (not in db): " + thumbPath);
            });    
        } else {
            // Make sure source exists, if not clean up db and delete target
            existsFunction(srcPath, function(exists) {
                if (exists && !shouldIgnore(options, srcPath)) {
                    // source file exists so nothing to do
                    callback();  
                } else {
                    // Cannot access source file or it should be ignored
                    // we don't want to delete everything when the network is not assessible
                    // so we'll only delete if we can access the src directory
                    existsFunction(options.srcPath, function(srcPathExists) {
                        if (srcPathExists) {
                            
                            // source file doesn't exist clean db and delete tgt and thumb
                            db.deleteFileInfo(tgtFile, function(err) {
                                
                                console.log("deleting (src doesn't exist): " + tgtFile);
                                fs.unlink(tgtFile, callback);    

                                // also delete thumbnails
                                var thumbPath = tgtFile.replace(options.tgtPath, options.thumbPath);
                                fs.unlink(thumbPath, function(err) {
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
    
var isImageFile = function(path)
{
    var lPath = path.toLowerCase();
    return lPath.endsWith(".jpg");// || lPath.endsWith(".nef") || lPath.endsWith(".cr2");
}

var shouldIgnore = function(options, path) {
    for (var i=0;i<options.ignorePaths.length; i++) {
        if (path.indexOf('/' + options.ignorePaths[i] + '/') != -1) {
            return true;
        }
    }
    return false;
}

var generateThumbs = function(file, options, callback) {

    if (shouldIgnore(options, file)) {
        console.log('skipping: ' + file);
        return callback(null);
    }

    if (options.job != null)
    {
        var tgtFile = file.replace(options.srcPath, options.tgtPath);

        options.job.send( { file: file, tgtFile: tgtFile, options: options});

        return callback(null);
    } else {
        var tgtFile = file.replace(options.srcPath, options.tgtPath);
        generateThumbs2(file, tgtFile, options, callback);
    }
}

var generateThumbs2 = function(file, tgtFile, options, callback) {
console.log("generateThumbs2: " + file)
  sync(function() {
    try {
    if (isImageFile(file)) {
        var start = new Date();
        console.log('found: ' + file);            
        //var tgtFile = file.replace(options.srcPath, options.tgtPath);
        //console.log(tgtFile)
        var ticket = ensureDirExists.future(null, path.dirname(tgtFile), 0777 & (~process.umask()));
        var thumbFile = tgtFile.replace(options.tgtPath, options.thumbPath);
        var ticket2 = ensureDirExists.future(null, path.dirname(thumbFile), 0777 & (~process.umask()));
                        
        var sStat = fs.stat.future(null, file);
        var tStat=null;

        try {
          tStat = fs.stat.sync(null, tgtFile);
        }
        catch(err) {
          
          if (err.code != 'ENOENT'){
            throw(err);
          } 
        }

        //console.log(tStat);
        //if(tStat!=null){
            
       
        //console.log(sStat.result.mtime.getTime());
        //console.log( tStat.mtime.getTime());
       // }

        if (tStat == null || sStat.result.mtime.getTime() != tStat.mtime.getTime()) {
            console.log('scailing: ' + tgtFile)
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
	
	    db.InsertFileInfo.sync(null, data, tgtFile);
data.Telemetry.InsertFileInfo = new Date() - start;
start = new Date();

            fs.utimes.sync(null, tgtFile, sStat.result.atime, sStat.result.mtime);
            fs.utimes.sync(null, thumbFile, sStat.result.atime, sStat.result.mtime);
data.Telemetry.SetDestFileTimestamp = new Date() - start;

//console.log(data.Telemetry);
        } else { 
         //  console.log('not processing: ' + tgtFile) 
        }
    } 
   } 
   catch (err) {
     console.log("error: " + err);
   }
  }, callback)
}

var parseKeywords = function(obj) {
    //console.log(obj);
  var vals = [];
  if (obj != null) {
    if (obj instanceof Array)
      vals = obj;
    else
      vals = obj.split(';');
  }

  var res = [];
  for (var i=0; i<vals.length; i++) {
    var r = vals[i].trim();
    if (r != '') {
      var r2 = r.split(',');
      for (var j=0; j<r2.length; j++) {
          var r3 = r2[j].trim();
          if (r3 != '')
            res.push(r3);
      }
    }
  }   
  //console.log(res);
  return res;
}

var parseDate = function(date, file) {
    var d;
    try {
        if (date.indexOf(':') == 4) {  // '2008:05:07 14:24:39-08'
            var s = date.split(' ');
            var s1 = s[0].split(':');
            var s2 = s[1].split(':');

            var offset=0;
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
            d = new Date(s1[0], s1[1]-1, s1[2], s2[0], s2[1], s2[2]);
        } else {
            d = new Date(date);
        }
    }
    catch (e) {}

    //console.log("in: " + date + "   out: " + d + " " + file)
    return d;
}

var ReadFileInfo = function(file, callback) {

 sync(function() {

     //console.log("exiftool -FileModifyDate -Title -Rating -Common -Lens -Subject -XPKeywords -Keywords -ImageHeight -ImageWidth -j \"" + file + "\"")
    var res = exec.sync(null, "exiftool -FileModifyDate -Title -Rating -Common -LensID -Subject -XPKeywords -Keywords -ImageHeight -ImageWidth -Make -CameraModel -ExposureTime -FocalLength -ISOSpeed -FStop -j \"" + file + "\"");
   //console.log(res)
    var json = eval(res)[0];
    json.Tags = parseKeywords(json.Keywords).concat(parseKeywords(json.XPKeywords)).concat(parseKeywords(json.Subject)).unique();
    //console.log('parsed')
    // parse dateTaken
    json.DateTaken = parseDate(json.DateTimeOriginal, file);
    if (json.DateTaken == null){
        json.DateTaken = parseDate(json.FileModifyDate, file);
    }
 
    return json;  
 }, callback)

}



var scale = function(data, outfile, options, callback) {
    //console.log('scale')

    var thumbFile = outfile.replace(options.tgtPath, options.thumbPath);
    var gmCommand;

     if (data.ImageWidth > options.tgtWidth || data.ImageHeight > options.tgtHeight) {

       var h=0, w=0, clipW = options.tgtWidth, clipH = options.tgtHeight;
       var srcAspect = data.ImageWidth / data.ImageHeight;
       if (srcAspect > (options.tgtWidth/options.tgtHeight)) {
         h = options.tgtHeight;
         w = Math.round(data.ImageWidth / (data.ImageHeight / options.tgtHeight));            
	 
         if ((options.tgtWidth/w) < options.maxClip) {
           var ratio = options.maxClip/(options.tgtWidth/w);
           clipH = h = Math.round(h / ratio);
           w = Math.round(w / ratio);
         }
       } else {
         w = options.tgtWidth;
	     h = Math.round(data.ImageHeight / (data.ImageWidth / options.tgtWidth));

         if ((options.tgtHeight/h) < options.maxClip) {
           var ratio = options.maxClip/(options.tgtHeight/h);
           clipW = w = Math.round(w / ratio);
           h = Math.round(h / ratio);
         }
       }

       var cropX = Math.round( (w - clipW) / 2);
       var cropY =  Math.round((h - clipH) / 2);
//console.log('before: ' + data.SourceFile + " w:" + w + " h:"+h+" cw:"+clipW+" ch:"+clipH+" cx:"+cropX+" cy:"+cropY+" out:"+outfile);



        gmCommand = 'gm convert -quality 75 "' + data.SourceFile + '" -resize ' + w + 'x' + h + '! -crop ' + clipW + 'x' + clipH + '+' +cropX + '+' + cropY + ' +profile "*" -write "' + outfile;
        gmCommand += '" -resize ' + options.thumbWidth + 'x' + options.thumbHeight + ' +profile "*" "' + thumbFile + '"';
        
        data.DestWidth = clipW;
        data.DestHeight = clipH;
       

       /*var f = gm(data.SourceFile).resize(w,h, "!").crop(clipW, clipH, cropX, cropY);
       f.write(outfile, function(err, stdout, stderr, command) {
         if (err)
           console.log("error resizing: " + data.SourceFile + " : " + err);
         else
           //console.log("resized: " + data.SourceFile);
           console.log(command);

         //console.log(outfile + ": " + clipW +"x"+clipH);
         data.DestWidth = clipW;
         data.DestHeight = clipH;
         callback(err);
       });
       
       var thumbFile = outfile.replace(options.tgtPath, options.thumbPath);
       //f.resize(options.thumbWidth,options.thumbHeight).write(thumbFile, function(err) { 
       gm(data.SourceFile).thumb(options.thumbWidth, options.thumbHeight, thumbFile, 100, function(err, stdout, stderr, command) {
           if (err) 
               console.log("error creating thumbnail for: " + data.SourceFile + " err: " + err);
           else
           //console.log("resized: " + data.SourceFile);
           console.log(command);
       });*/

     } else {
       data.DestWidth = data.ImageWidth;
       data.DestHeight = data.ImageHeight;
       //copyFile(data.SourceFile, outfile, callback);

       // var cmd = 'gm convert -quality 75 "' + data.SourceFile + '" -resize ' + w + 'x' + h + '! -crop ' + clipW + 'x' + clipH + '+' +cropX + '+' + cropY + ' +profile "*" -write "' + outfile;
       //var cmd = 'gm convert -quality 75 "' + data.SourceFile + '" -resize ' + w + 'x' + h + '! -crop ' + clipW + 'x' + clipH + '+' +cropX + '+' + cropY + ' -write "' + outfile;
       //gmCommand = 'gm convert "' + data.SourceFile + '" -resize "' + options.thumbWidth + 'x' + options.thumbHeight + '>" +profile "*" "' + thumbFile + '"';

       gmCommand = 'gm convert "' + data.SourceFile + '" +profile "*" -write "' + outfile + '" -resize ' + options.thumbWidth + 'x' + options.thumbHeight + ' +profile "*" "' + thumbFile + '"';
     } 

     exec(gmCommand, function(err) {
        if (err)
            console.log("error scaling: " + data.SourceFile + " : " + err);
        else
            console.log("scaled: " + data.SourceFile + ' ' + data.ImageWidth + 'x' + data.ImageHeight + ' -> ' + data.DestWidth + 'x' + data.DestHeight);
        
        callback(err);
    });
}

/*var copyFile2 = function(src, dest, callback) {
    fs.readFile(src, function(err, data){
        fs.writeFile(dest, data, function(err) {
            if (err) {
                console.log("failed to copy: " + src + " to " + dest + " err: " + err);
                return callback(err)
            }

            console.log("copied: " + src);
            callback();
        });
    });
}*/

function copyFile(source, target, cb) {
  var cbCalled = false;

  var rd = fs.createReadStream(source);
  rd.on("error", function(err) {
    done(err);
  });
  var wr = fs.createWriteStream(target);
  wr.on("error", function(err) {
    done(err);
  });
  wr.on("close", function(ex) {
    done();
  });
  rd.pipe(wr);

  function done(err) {
    if (!cbCalled) {
        if (err) {
            cb(err);
        } else {
            fs.stat(source, function(err, stat) {
                if (err) {
                    cb(err);
                } else {
                    fs.utimes(target, stat.atime, stat.mtime, function(err) {
                        cb(err);
                        cbCalled = true;
                    });
                }
            })
        }
    }
  }
}

var walk = function(dir, options, done, callback) {
  
  fs.readdir(dir, function (err, list) {
    
    if (err) 
        return done(err);
    
    var i=0;
    (function next() {
      var file = list[i++];
      if (!file) 
        return done(null);
      
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
           // console.log('walking: ' + file);
          walk(file, options, function (err) {
             next();
          }, callback);
        } else {
          callback(file, options, function(err) {
            next();
          });
        }	
       });
     })();
  });
}; 

function ensureDirExists(dir, mode, callback) {
  var existsFunction = fs.exists || path.exists;

  existsFunction(dir, function(exists) {
    if (exists) return callback(null);

    var current = path.resolve(dir);
    var parent = path.dirname(current);

    ensureDirExists(parent, mode, function (err) {
      if (err) 
        return callback(err);

      fs.mkdir(current, mode, function(err) {
        if (err && err.code != 'EEXIST')  
            return callback(err);
        
        callback(null);
      });
      
    });
  });
}