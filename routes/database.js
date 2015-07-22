/*
 * SQLite3 database operations
 */

var fs = require('fs')
    , path = require('path')
    , sqlite3 = require('sqlite3');


var db = new sqlite3.Database('thumbs.db');


exports.initialize = function(callback) {
    
    var sql = "create table if not exists Thumbnails (id INTEGER primary key, SourcePath TEXT unique, DestPath TEXT unique, DestWidth int, DestHeight int, Rating int, Timestamp TEXT, Model TEXT, FocalLength TEXT, ExposureTime TEXT, Aperture Real, ISO int, LensID TEXT, Make TEXT, Enabled int default 1, Modified int default 0); ";
    sql += "create table if not exists Keywords (id INTEGER primary key, thumb_id int not null, keyword TEXT, constraint uq_keyword unique(thumb_id, keyword), Foreign key (thumb_id) references Thumbnails(id)); ";
    sql += "create index if not exists Thumbnails_Rating_idx on Thumbnails(Rating); ";
    sql += "create index if not exists Thumbnails_DestPath_idx on Thumbnails(DestPath); ";
    sql += "create index if not exists Thumbnails_Timestamp_idx on Thumbnails(Timestamp); ";
    sql += "create index if not exists Keywords_keyword_idx on Keywords(keyword); ";
    sql += "create index if not exists Keywords_thumb_id_idx on Keywords(thumb_id); ";

    // ALTER TABLE Thumbnails ADD COLUMN Enabled int DEFAULT 1;

    // remove keywords when a thumbnail is deleted
    //RunSql("create trigger if not exists Thumbnails_DeleteKeywords_tr before delete on Thumbnails for each row begin delete from Keywords where thumb_id=old.id; end;");
    // update pk (id) when a thumbnail is deleted so we maintain sequential id's (so we can efficiently select random rows)
    //RunSql("create trigger if not exists Thumbnails_FixIds_tr after delete on Thumbnails for each row when old.id < (select max(id) from Thumbnails) begin update Thumbnails set id = old.id where id=(select max(id) from Thumbnails); update Keywords set thumb_id = old.id where thumb_id=(select max(id) from Thumbnails);  end;");
    // Whenever a thumbail's pk (id) is updated we need to update the thumb_id for its Keywords
    //RunSql("create trigger if not exists Thumbnails_Update_id_tr after update of id on Thumbnails begin update Keywords set thumb_id = new.id where thumb_id=old.id; end;");
    //RunSql("create index if not exists Thumbnails_SourcePath_idx on Thumbnails(SourcePath)");

    db.exec(sql, callback);
}

//select id from Thumbnails where id in (select thumb_id from Keywords where keyword in ('Carter')) limit 1 offset abs(Random()) % (select count(*) from Keywords where keyword in ('Carter'));
//select id from Thumbnails where id in (select thumb_id from Keywords where keyword in ('Carter')) order by Random() limit 1;

//select id from Thumbnails where Rating > 0 order by Random() limit 1;
//select id from Thumbnails where Rating > 0 limit 1 offset abs(Random()) % (select count(*) from Thumbnails where Rating > 0);

String.prototype.buildWhere = function (str) {
    var val = this;
    if (this.length == 0)
        val = ' WHERE ';
    else
        val += ' AND ';
    val += '(' + str + ')';
    return val;
}

var getWhere = function(settings) {
    var where = '';
    where = where.buildWhere('Enabled=1');
    if (settings.minDate)
        where = where.buildWhere("Timestamp >= '" + new Date(settings.minDate).toISOString() +"'");
    if (settings.maxDate)
        where = where.buildWhere("Timestamp <= '" + new Date(settings.maxDate).toISOString() +"'");
    if (settings.rating)
        where = where.buildWhere('Rating >= ' + settings.rating);
    if (settings.keywords) {
        var str = '';
        for (var i = 0; i < settings.keywords.length; i++) {
            var keyword = settings.keywords[i].trim().escape();
            if (keyword.length > 0) {
                if (str.length > 0)
                    str += ",";
                str += "'" + keyword + "'";
            }
        }

        if (str.length > 0)
            where = where.buildWhere('id in (select thumb_id from Keywords where keyword in (' + str + '))');
    }

    return where;
}


exports.thumbs = function (settings, limit, offset, callback) {
    var where = getWhere(settings);
    var stmt = "select DestPath from Thumbnails" + where + " limit " + limit + " offset " + offset + ";";
    //console.log("qry: " + stmt)
    db.all(stmt, function (err, results) {
        if (err) {
            console.log(stmt);
            console.log("select err1: " + err);
            callback(err);
        } else {
            var res = [];
            for (var i = 0; i < results.length; i++)
                res.push(results[i].DestPath);
            callback(null, res);
        }
    });
}


exports.checksettings = function (settings, callback) {

    var where = getWhere(settings);

    //console.log("where: " + where)

    var stmt = "select count(*) as count from Thumbnails" + where + ";";
    //console.log("qry: " + stmt)
    db.all(stmt, function (err, results) {
        if (err) {
            console.log(stmt);
            console.log("select err2: " + err);
            callback(err);
        } else {
            var count = results[0].count;
            db.all("select count(*) as totalcount from Thumbnails;", function (err, results2) {
                if (err) {
                    console.log("select err3: " + err);
                    callback(err);
                } else {
                    callback(null, { count: count, totalCount: results2[0].totalcount });
                }
            })
        }
    });
}

exports.next = function (settings, callback) {

    var where = getWhere(settings);

    //console.log("where: " + where)

    //var stmt = "select *, (select group_concat(keyword, ',') from Keywords where thumb_id=t.rowid) as Keywords from Thumbnails t where rowid = (abs(random()) % ((select max(rowid) from Thumbnails))+1)";
    var stmt = "select *, (select group_concat(keyword, ',') from Keywords where thumb_id=t.rowid) as Keywords from Thumbnails t" + where + " limit 1 offset ifnull(abs(Random()) % (select count(*) from Thumbnails" + where + "),0);";
    //console.log("qry: " + stmt)
    //var stmt = "select *, (select group_concat(keyword, ',') from Keywords where thumb_id=t.rowid) as Keywords from Thumbnails t where Rating >= settings.rating";
    LoadFile(stmt, callback);
}

exports.update = function (file, enabled, keywords, rating, callback) {

    var thumbId = "(select id from Thumbnails where DestPath='" + file.escape() + "')";

    // update rating and enabled flags
    var sql = "update Thumbnails set Enabled=" + enabled + ", rating=" + rating + ", Modified=1 where DestPath='" + file.escape() + "';";

    // remove existing keywords
    sql += " Delete from Keywords where thumb_id=" + thumbId + ";";

    // add new keywords
    for (var i = 0; i < keywords.length; i++) {
        var word = keywords[i].trim();
        if (word.length > 0) {
            sql += " Insert into Keywords Values(null," + thumbId + ", '" + word.escape() + "');"
        }
    }

    db.exec(sql, function (err) {
        if (err)
            console.log("Sql error executing statement: " + sql + " err: " + err);
        console.log(sql);
        callback(err);
    });

}


exports.load = function (file, callback) {

   var stmt = "select *, (select group_concat(keyword, ',') from Keywords where thumb_id=t.rowid) as Keywords from Thumbnails t where DestPath like '%" + file.escape() + "';";
   LoadFile(stmt, callback);
}


var LoadFile = function (stmt, callback) {
    db.all(stmt, function (err, results) {
        if (err) {
            console.log(stmt);
            console.log("select err4: " + err);
            callback(err);
        } else if (results.length == 1) {
            
            var keywords = [];
            if (results[0].Keywords)
                keywords = results[0].Keywords.split(',');

            callback(null, { file: results[0].DestPath,
                width: results[0].DestWidth,
                height: results[0].DestHeight,
                keywords: keywords,
                rating: results[0].Rating,
                datetaken: new Date(results[0].Timestamp).toISOString(),
                enabled: results[0].Enabled
            });
        } else {
            callback(null, {});
        }
    });
}
 


exports.daterange = function (callback) {
    var stmt = "select min(timestamp) as min, max(timestamp) as max from Thumbnails;";
    db.all(stmt, function (err, results) {
        if (err) {
            console.log("daterange err: " + err);
            callback(err);
        } else {
            var data = { min: results[0].min, max: results[0].max };
            var minDate = new Date(data.min);
            //console.log(minDate.toString())
            //console.log(minDate.getDate() + '-' + minDate.getMonth() + '-' + minDate.getFullYear())
            callback(null, data);
        }
    });
}

exports.keywords = function (term, callback) {
    var stmt = "select distinct keyword from Keywords where keyword like '%" + term.escape() + "%'";
    db.all(stmt, function (err, results) {
        if (err) {
            console.log("keywords err: " + err);
            callback(err);
        } else {
            var terms = [];

            for (var i = 0; i < results.length; i++) {
                var words = results[i].keyword.split(',');
                for (var j = 0; j < words.length; j++) {
                    var word = words[j].trim();
                    if (word && terms.indexOf(word) == -1)
                        terms.push(word);
                }
            }

            callback(null, terms);
        }
    });
}

exports.getSourcePathFromTargetPath = function (tgtPath, callback) {
    var sql = "Select SourcePath from Thumbnails where DestPath='" + tgtPath.escape() + "';";
    db.all(sql, function (err, results) {
        if (err) {
            console.log("getSourcePathFromTargetPath error: " + err + " sql: " + sql);
            callback(err);
        } else if (results.length == 1) {
            callback(null, results[0].SourcePath);
        } else {
            callback(null, null);
        }
    });
}

exports.deleteFileInfo = function(tgtPath, callback){

    // get id of row to be deleted
    var sql1 = "Select id from Thumbnails where DestPath='" + tgtPath.escape() + "';";
    db.all(sql1, function(err, results){
        if (err) {
            console.log("Sql select id error: " + err);
            callback(err);
        } else if (results.length == 1) {
            var deletedId = results[0].id;

            var sql2 = "Select max(id) as maxId from Thumbnails;";
            db.all(sql2, function(err, results){
                if (err) {
                    console.log("Sql select maxId error: " + err);
                    callback(err);
                } else {
                    var maxId =  results[0].maxId;
             
                    //console.log("Sql deletedId: " + deletedId + " maxId: " + maxId);  
                    
                    // delete keywords for deleted file
                    var sql = "Delete from Thumbnails where id=" + deletedId + ";";
                    sql += " Delete from Keywords where thumb_id=" + deletedId + ";";
                    if (deletedId != maxId) {
                        // remap row id of Thumbnail table so there are no gaps
                        // so we can efficiently to random row queries
                        sql += " Update Thumbnails set id=" + deletedId + " where id=" + maxId + ";";
                        sql += " Update Keywords set thumb_id=" + deletedId + " where thumb_id=" + maxId + ";";
                    }

                    db.exec(sql, function(err){
                       if (err)
                            console.log("Sql error executing statement: "+sql + " err: " + err);
                       else
                            console.log("db.deleteFileInfo(" + tgtPath + ") deleted id: " + deletedId + " and replaced with: " + maxId) ;    
                       callback(err); 
                    });
                }
            });
         } else {
            // console.log(results);
            // console.log("Sql not deleted because it doesn't not exist: " + tgtPath)
             callback(null); // tgtPath does not exist
         }
     });
}

exports.getNext = function (callback) {
    var sql1 = "Select DestPath from Thumbnails where DestWidth=0 limit 1";
    db.all(sql1, function (err, results) {
        if (err) {
            console.log(err);
            callback(err, null);
        } else if (results.length == 1) {
            callback(null, results[0].DestPath);
        } else {
            callback(null, null);
        }
    });
}

exports.updateDestSize = function (file, data, callback) {
    var s = "update Thumbnails set DestWidth=" + data.ImageWidth + ", DestHeight=" + data.ImageHeight + "  where DestPath='" + file.escape() + "'";
    console.log(s);
    //callback();
    db.exec(s, callback);
}

exports.InsertFileInfo = function (data, DestPath, callback) {
    //console.log(data);
    // first delete existing row
    exports.deleteFileInfo(DestPath, function (err) {
        if (err) {
            console.log("Sql - failed to delete existing thumb for: " + DestPath);
            callback(err);
        } else {
            // insert new file
            var statement = db.prepare("Insert into Thumbnails Values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            statement.run(null, data.SourceFile, DestPath, data.DestWidth, data.DestHeight, data.Rating, data.DateTaken.toISOString(), data.Model, 
                data.FocalLength, data.ExposureTime, data.Aperture, data.ISO, data.LensID, data.Make, 1, 0, function (err) {
                if (err) {
                    console.log("insert thumbnail err: " + err);
                    callback(err);
                } else {
                    var id = this.lastID;

                    InsertKeywords(id, data.Tags, callback);
                }
            });
            statement.finalize();
        }
    })
}


var InsertKeywords = function(id, keywords, callback) {
    var sql = "", cnt = 0;
    for (var i = 0; i < keywords.length; i++) {
        var word = keywords[i].trim();
        if (word.length > 0) {
            sql += "Insert into Keywords Values(null," + id + ",'" + word.escape() + "');"
            cnt++;
        }
    }

    if (cnt > 0) {
        db.exec(sql, function (err) {
            if (err)
                console.log("Sql error executing statement: " + sql + " err: " + err);
            // else
            //   console.log("Sql successfully inserted " + cnt + " keywords");    

            callback(err);
        });
    } else {
        //console.log('Sql no keywords to insert');
        callback(null);
    }
}
 

