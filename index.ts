import * as readline from "readline";
import { getAddress } from "./CEAddressString";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const waitForUserInput = function () {
  rl.question("CEAddressString> ", (text) => {
    try {
      const pointer = getAddress(text);
      console.log("0x" + pointer.toString(16).toUpperCase());
    } catch (error) {
      console.log(error.toString());
    }
    waitForUserInput();
  });
};

waitForUserInput();

// getAddress(`game.exe`);
