import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { sleep, retry, retryInterval, nodeify, nodeifyAll,
         parallel, asyncmap, asyncfilter, waitForCondition } from '../lib/asyncbox';


chai.use(chaiAsPromised);
let should = chai.should();

describe('sleep', function () {
  it('should work like setTimeout', async function () {
    let now = Date.now();
    await sleep(20);
    (Date.now() - now).should.be.above(19);
  });
});

describe('retry', function () {
  let okFnCalls = 0;
  let okFn = async function (val1, val2) {
    await sleep(15);
    okFnCalls++;
    return val1 * val2;
  };
  let badFnCalls = 0;
  let badFn = async function () {
    await sleep(15);
    badFnCalls++;
    throw new Error("bad");
  };
  let eventuallyOkFnCalls = 0;
  let eventuallyOkFn = async function (times) {
    await sleep(15);
    eventuallyOkFnCalls++;
    if (eventuallyOkFnCalls < times) {
      throw new Error("not ok yet");
    }
    return times * times;
  };
  let eventuallyOkNoSleepFn = async function (times) {
    eventuallyOkFnCalls++;
    if (eventuallyOkFnCalls < times) {
      throw new Error("not ok yet");
    }
    return times * times;
  };
  it('should return the result of a passing function', async function () {
    let start = Date.now();
    let res = await retry(3, okFn, 5, 4);
    res.should.equal(20);
    (Date.now() - start).should.be.above(14);
    okFnCalls.should.equal(1);
  });
  it('should retry a failing function and eventually throw the same err', async function () {
    let err = null;
    let start = Date.now();
    try {
      await retry(3, badFn);
    } catch (e) {
      err = e;
    }
    should.exist(err);
    err.message.should.equal('bad');
    badFnCalls.should.equal(3);
    (Date.now() - start).should.be.above(44);
  });
  it('should return the correct value with a function that eventually passes', async function () {
    let err = null;
    let start = Date.now();
    try {
      await retry(3, eventuallyOkFn, 4);
    } catch (e) {
      err = e;
    }
    should.exist(err);
    err.message.should.equal('not ok yet');
    eventuallyOkFnCalls.should.equal(3);
    (Date.now() - start).should.be.above(35);

    // rerun with ok number of calls
    start = Date.now();
    eventuallyOkFnCalls = 0;
    let res = await retry(3, eventuallyOkFn, 3);
    eventuallyOkFnCalls.should.equal(3);
    res.should.equal(9);
    (Date.now() - start).should.be.above(35);
  });
  describe('retryInterval', function () {
    it('should return the correct value with a function that eventually passes', async function () {
      eventuallyOkFnCalls = 0;
      let err = null;
      let start = Date.now();
      try {
        await retryInterval(3, 15, eventuallyOkNoSleepFn, 4);
      } catch (e) {
        err = e;
      }
      should.exist(err);
      err.message.should.equal('not ok yet');
      eventuallyOkFnCalls.should.equal(3);
      (Date.now() - start).should.be.above(30);

      // rerun with ok number of calls
      start = Date.now();
      eventuallyOkFnCalls = 0;
      let res = await retryInterval(3, 15, eventuallyOkNoSleepFn, 3);
      eventuallyOkFnCalls.should.equal(3);
      res.should.equal(9);
      (Date.now() - start).should.be.above(30);
    });
    it('should not wait on the final error', async function () {
      const start = Date.now();
      try {
        await retryInterval(3, 2000, badFnCalls);
      } catch (err) {
        (Date.now() - start).should.be.below(4100);
      }
    });
  });
});

describe('nodeifyAll', function () {
  let asyncFn = async function (val) {
    await sleep(15);
    return val;
  };
  let asyncFn2 = async function (val) {
    await sleep(15);
    return [val, val + val];
  };
  let badAsyncFn = async function () {
    await sleep(15);
    throw new Error('boo');
  };
  let cbMap = nodeifyAll({asyncFn, asyncFn2, badAsyncFn});
  it('should turn async functions into nodey things', function (done) {
    let start = Date.now();
    nodeify(asyncFn('foo'), function (err, val, val2) { // eslint-disable-line promise/prefer-await-to-callbacks
      should.not.exist(err);
      should.not.exist(val2);
      val.should.equal('foo');
      (Date.now() - start).should.be.above(14);
      done();
    });
  });
  it('should turn async functions into nodey things via nodeifyAll', function (done) {
    let start = Date.now();
    cbMap.asyncFn('foo', function (err, val, val2) { // eslint-disable-line promise/prefer-await-to-callbacks
      should.not.exist(err);
      should.not.exist(val2);
      val.should.equal('foo');
      (Date.now() - start).should.be.above(14);
      done();
    });
  });
  it('should turn async functions into nodey things with mult params', function (done) {
    let start = Date.now();
    nodeify(asyncFn2('foo'), function (err, val) { // eslint-disable-line promise/prefer-await-to-callbacks
      should.not.exist(err);
      val.should.eql(['foo', 'foofoo']);
      (Date.now() - start).should.be.above(14);
      done();
    });
  });
  it('should handle errors correctly', function (done) {
    let start = Date.now();
    nodeify(badAsyncFn('foo'), function (err, val) { // eslint-disable-line promise/prefer-await-to-callbacks
      should.not.exist(val);
      err.message.should.equal('boo');
      (Date.now() - start).should.be.above(14);
      done();
    });
  });
});

//describe('nodeifyAll', () => {
  //let asyncFn = async (val) => {
    //await sleep(15);
    //return val;
  //};
  //let asyncFn2 = async (val) => {
    //await sleep(15);
    //return [val, val + val];
  //};
  //let badAsyncFn = async () => {
    //await sleep(15);
    //throw new Error('boo');
  //};
//});

describe('parallel', function () {
  let asyncFn = async function (val) {
    await sleep(50);
    return val;
  };
  let badAsyncFn = async function () {
    await sleep(20);
    throw new Error("boo");
  };
  it('should perform tasks in parallel and return results', async function () {
    let vals = [1, 2, 3];
    let promises = [];
    let start = Date.now();
    for (let v of vals) {
      promises.push(asyncFn(v));
    }
    let res = await parallel(promises);
    (Date.now() - start).should.be.above(49);
    (Date.now() - start).should.be.below(59);
    res.sort().should.eql([1, 2, 3]);
  });
  it('should error with first response', async function () {
    let vals = [1, 2, 3];
    let promises = [];
    let start = Date.now();
    for (let v of vals) {
      promises.push(asyncFn(v));
    }
    promises.push(badAsyncFn());
    let err = null;
    let res = [];
    try {
      res = await parallel(promises);
    } catch (e) {
      err = e;
    }
    (Date.now() - start).should.be.above(19);
    (Date.now() - start).should.be.below(49);
    should.exist(err);
    res.should.eql([]);
  });

  describe('waitForCondition', function () {
    it('should wait and succeed', async function () {
      let ref = Date.now();
      function condFn () {
        return Date.now() - ref > 200;
      }
      await waitForCondition(condFn, {waitMs: 1000, intervalMs: 10});
      let duration = Date.now() - ref;
      duration.should.be.above(200);
      duration.should.be.below(250);
    });
    it('should wait and fail', async function () {
      let ref = Date.now();
      function condFn () {
        return Date.now() - ref > 200;
      }
      await (waitForCondition(condFn, {waitMs: 100, intervalMs: 10}))
        .should.be.rejectedWith(/Condition unmet/);
    });
  });
});

describe('asyncmap', function () {
  const mapper = async function (el) {
    await sleep(10);
    return el * 2;
  };
  const coll = [1, 2, 3];
  it('should map elements one at a time', async function () {
    let start = Date.now();
    (await asyncmap(coll, mapper, false)).should.eql([2, 4, 6]);
    (Date.now() - start).should.be.above(30);
  });
  it('should map elements in parallel', async function () {
    let start = Date.now();
    (await asyncmap(coll, mapper)).should.eql([2, 4, 6]);
    (Date.now() - start).should.be.below(20);
  });
  it('should handle an empty array', async function () {
    (await asyncmap([], mapper, false)).should.eql([]);
  });
  it('should handle an empty array in parallel', async function () {
    (await asyncmap([], mapper)).should.eql([]);
  });
});

describe('asyncfilter', function () {
  const filter = async function (el) {
    await sleep(5);
    return el % 2 === 0;
  };
  const coll = [1, 2, 3, 4, 5];
  it('should filter elements one at a time', async function () {
    let start = Date.now();
    (await asyncfilter(coll, filter, false)).should.eql([2, 4]);
    (Date.now() - start).should.be.above(19);
  });
  it('should filter elements in parallel', async function () {
    let start = Date.now();
    (await asyncfilter(coll, filter)).should.eql([2, 4]);
    (Date.now() - start).should.be.below(9);
  });
  it('should handle an empty array', async function () {
    let start = Date.now();
    (await asyncfilter([], filter, false)).should.eql([]);
    (Date.now() - start).should.be.below(9);
  });
  it('should handle an empty array in parallel', async function () {
    let start = Date.now();
    (await asyncfilter([], filter)).should.eql([]);
    (Date.now() - start).should.be.below(9);
  });
});
