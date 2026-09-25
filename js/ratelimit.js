var buckets = {};
function cleanup() {
    var now = Date.now();
    for (var key in buckets) {
        buckets[key] = buckets[key].filter(function(t){ return now - t < 60000; });
        if (buckets[key].length === 0) delete buckets[key];
    }
}
setInterval(cleanup, 60000);
function checkLimit(ip, bucket, maxPerMinute) {
    var key = bucket + ':' + ip;
    var now = Date.now();
    if (!buckets[key]) buckets[key] = [];
    buckets[key] = buckets[key].filter(function(t){ return now - t < 60000; });
    if (buckets[key].length >= maxPerMinute) return false;
    buckets[key].push(now);
    return true;
}
module.exports = { checkLimit };
