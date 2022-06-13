const mongodb = require("mongodb");

class KVBaseMongo {

  constructor() {
    console.log("asdasda")
  }

  connect(MONGODB_URI, callback) {
    console.log("Connecting to mongodb...")
    mongodb.MongoClient.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
      if (err) {
        console.log(err);
        process.exit(1);
      } else {
        console.log("MongoDB successfully connected.")
        this.db = client.db();
        console.log("Database connection ready");
        this.db.collection("bots").createIndex(
          { "key": 1 }, { unique: true }
        );
        callback();
      }
    });
  }

  set(k, v) {
    return new Promise(resolve => {
      //this.db.set(k, v).then(() => {resolve();});
      this.db.collection(BOTS_COLLECTION).updateOne({key: key}, { $set: { value: content, key: key } }, { upsert: true }, function(err, doc) {
        if (err) {
          reject(err);
        }
        else {
          resolve();
        }
      });
    });
  }

  get(k) {
    return new Promise(resolve => {
      //this.db.get(k).then(value => {resolve(value)});
      this.db.collection(BOTS_COLLECTION).findOne({ key: key }, function(err, doc) {
        if (err) {
          reject(err);
        }
        else {
          resolve();
        }
      });
    });
  }

  remove(key) {
    return new Promise(resolve => {
      this.db.collection(BOTS_COLLECTION).deleteOne({key: key}, function(err) {
        if (err) {
          reject(err);
        }
        else {
          resolve();
        }
      });
    });
  }
}

module.exports = { KVBaseMongo };