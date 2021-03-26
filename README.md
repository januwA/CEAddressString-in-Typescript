## CEAddressString-in-Typescript

Simulate the getAddress function of cheat-engine in typescript


## test
```js
const SYMBOL_TABLE = {
  s1: 0x222,
  s2: 0x333,
};

const MODULE_TABLE = {
  "game.exe": 0x00400000,
  "user32.dll": 0x763b0000,
};

assert.ok(getAddress("1+1") === 2);
assert.ok(getAddress("3**2") === 3 ** 2);

assert.ok(getAddress("[1+1]") === 0xce);

assert.ok(getAddress("[1+1]+s1") === 0xce + SYMBOL_TABLE.s1);
assert.ok(getAddress("[1+1]+s1*s2") === 0xce + SYMBOL_TABLE.s1 * SYMBOL_TABLE.s2);

assert.ok(getAddress("[1] + [1]") === 0xce + 0xce);
assert.ok(getAddress("([1] + [1]) * 2") === (0xce + 0xce) * 2);

assert.ok(getAddress("game.exe") === MODULE_TABLE["game.exe"]);
assert.ok(getAddress(" 'game.exe' + 'user32.dll' ") === MODULE_TABLE["game.exe"] + MODULE_TABLE["user32.dll"]);
```