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

const MODULE_IMPOT_TABLE = {
  user32: {
    MessageBoxA: 0x1,
    MessageBoxW: 0x2,
  },
};

assert.ok(getAddress("1+1") === 2);
assert.ok(getAddress("3**2") === 3 ** 2);

assert.ok(getAddress("[1+1]") === 0xce);

assert.ok(getAddress("[1+1]+s1") === 0xce + SYMBOL_TABLE.s1);
assert.ok(
  getAddress("[1+1]+s1*s2") === 0xce + SYMBOL_TABLE.s1 * SYMBOL_TABLE.s2
);

assert.ok(getAddress("[1] + [1]") === 0xce + 0xce);
assert.ok(getAddress("([1] + [1]) * 2") === (0xce + 0xce) * 2);

assert.ok(getAddress("game.exe") === MODULE_TABLE["game.exe"]);
assert.ok(
  getAddress(" 'game.exe' + 'user32.dll' ") ===
    MODULE_TABLE["game.exe"] + MODULE_TABLE["user32.dll"]
);

assert.ok(
  getAddress("user32.MessageBoxA") === MODULE_IMPOT_TABLE.user32.MessageBoxA
);
assert.ok(
  getAddress("user32.MessageBoxA + user32.MessageBoxW") ===
    MODULE_IMPOT_TABLE.user32.MessageBoxA +
      MODULE_IMPOT_TABLE.user32.MessageBoxW
);

assert.ok(getAddress("MessageBoxA") === MODULE_IMPOT_TABLE.user32.MessageBoxA);

assert.ok(
  getAddress("MessageBoxA + MessageBoxW") ===
    MODULE_IMPOT_TABLE.user32.MessageBoxA +
      MODULE_IMPOT_TABLE.user32.MessageBoxW
);
```