var events = require('events');

/*

 Vardiff ported from stratum-mining share-limiter
 https://github.com/ahmedbodi/stratum-mining/blob/master/mining/basic_share_limiter.py

 */


function RingBuffer(maxSize) {
    var data = [];
    var diffData = [];
    var cursor = 0;
    var isFull = false;
    this.append = function (x,y) {
        if (isFull) {
            data[cursor] = x;
            diffData[cursor] = y;
            cursor = (cursor + 1) % maxSize;
        }
        else {
            data.push(x);
            diffData.push(y);
            cursor++;
            if (data.length === maxSize) {
                cursor = 0;
                isFull = true;
            }
        }
    };
    this.avg = function () {
        var sum = data.reduce(function (a, b) {
            return a + b
        });
        return sum / (isFull ? maxSize : cursor);
    };
    this.avgDiff = function () {
        var sum = diffData.reduce(function (a, b) {
            return a + b
        });
        return sum / (isFull ? maxSize : cursor);
    };
    this.size = function () {
        return isFull ? maxSize : cursor;
    };
    this.getFull = function(){
        return isFull;
    };
    this.clear = function () {
        data = [];
        diffData=[];
        cursor = 0;
        isFull = false;
    };
}

// Truncate a number to a fixed amount of decimal places
function toFixed(num, len) {
    return parseFloat(num.toFixed(len));
}

var varDiff = module.exports = function varDiff(port, varDiffOptions) {
    var _this = this;

    var bufferSize, tMin, tMax;

    //if (!varDiffOptions) return;

    //var variance = varDiffOptions.targetTime * (varDiffOptions.variancePercent / 100);
    
    bufferSize = varDiffOptions.adjectBufferSize;
    tMin = varDiffOptions.minTargetTime;
    tMax = varDiffOptions.maxTargetTime;

    this.manageClient = function (client) {

        var stratumPort = client.socket.localPort;

        if (stratumPort != port) {
            console.error("Handling a client which is not of this vardiff?");
        }
        var options = varDiffOptions;

        //初始时会设置diff,Diff 太大，第一次提交时，就进行难度调整。
        var lastTs; //= (Date.now() / 1000) | 0;
        var lastRtc; // = lastTs - options.retargetTime / 2;
        var timeBuffer; //= new RingBuffer(bufferSize);

        client.on('submit', function () {

            var ts = (Date.now() / 1000) | 0;

            if (!lastRtc) {
                lastRtc = ts - options.retargetTime / 2;
                lastTs = ts;
                timeBuffer = new RingBuffer(bufferSize);
                return;
            }

            var sinceLast = ts - lastTs;

            timeBuffer.append(sinceLast,client.difficulty);
            lastTs = ts;

            if(!( timeBuffer.getFull() || sinceLast>tMax )){
                return;
            }

            //console.error("Difficulty update: getFull="+timeBuffer.getFull()+" sinceLast>tMax="+(sinceLast>tMax) +" timeBuffer.size="+timeBuffer.size());

            var avg = timeBuffer.avg(); 

            //上次时间正常
            if(sinceLast<tMax && (avg>=tMin && avg<=tMax)){
                if(timeBuffer.getFull()){
                   // lastRtc = ts;
                    timeBuffer.clear();
                }

                //console.error("Difficulty update:Not time is right .avgtime="+avg+" tMin="+tMin+" tMax="+tMax);
                return;
            }

           // lastRtc = ts;

            var diffAvg = timeBuffer.avgDiff();
            var targetDiff = 0;
            
            if(sinceLast>=tMax){
                targetDiff = client.difficulty/sinceLast * (tMax * 0.9);

                //不能太小
                if(targetDiff<client.difficulty*0.5){
                    targetDiff = client.difficulty*0.5;
                }
            }else{
                targetDiff = diffAvg/avg * options.targetTime;
            }
            //var ddiff = options.targetTime / avg;

            //change diff
            //console.error("Difficulty update:avg="+avg+" diffAvg="+diffAvg+" targetDiff=" +targetDiff +" targetTime="+options.targetTime+" tMin="+tMin+" tMax"+tMax+" sinceLast:"+sinceLast+" client.difficulty:"+client.difficulty);
            
            if (targetDiff <= options.minDiff) {
                targetDiff = options.minDiff
            } else if (targetDiff >= options.maxDiff ) {
                targetDiff = options.maxDiff;
            }
           
            var newDiff = toFixed(targetDiff, 8);
            console.error("Difficulty update:newDiff="+newDiff);
            timeBuffer.clear();
            _this.emit('newDifficulty', client, newDiff);
        });
    };
};
varDiff.prototype.__proto__ = events.EventEmitter.prototype;
