const HEX_TEXT = /[^0-9a-f]/i;
const MODULE_OR_SYMBOL_TEXT = /[^\u4e00-\u9fa5\w\-\.]/i;

const TT_HEX = "HEX"; // 默认使用16进制
const TT_MODULE = "MODULE"; // a.exe or "a b.exe" or 'user32.MessageBoxA'
const TT_MMETHOD = "MMETHOD"; // user32.MessageBoxA 指定了模块的方法地址
const TT_METHOD = "METHOD"; // MessageBoxA
const TT_SYMBOL = "SYMBOL"; // s1 or s2
const TT_PLUS = "PLUS"; // +
const TT_MINUS = "MINUS"; // -
const TT_MUL = "MUL"; // *
const TT_DIV = "DIV"; // /
const TT_POW = "POW"; // **
const TT_LPAREN = "LPAREN"; // (
const TT_RPAREN = "RPAREN"; // )
const TT_LSQUARE = "LSQUARE"; // [
const TT_RSQUARE = "RSQUARE"; // ]
const TT_EOF = "EOF";

const PE_FILE = ["dll", "exe"];

const SYMBOL_TABLE = {
  s1: 0x222,
  s2: 0x333,
};

const MODULE_TABLE = {
  "game.exe": 0x00400000,
  "abc.exe": 0x00400000,
  "user32.dll": 0x763b0000,
};

const MODULE_IMPOT_TABLE = {
  user32: {
    MessageBoxA: 0x1,
    MessageBoxW: 0x2,
  },
};

class Position {
  constructor(
    public index: number,
    public row: number,
    public col: number,
    public text: string
  ) {}

  advance(char: string) {
    this.index++;
    this.col++;
    if (char === "\n") {
      this.col = 0;
      this.row++;
    }
  }

  copy() {
    return new Position(this.index, this.row, this.col, this.text);
  }
}

function stringsWithArrows(
  text: string,
  posStart: Position,
  posEnd: Position
): string {
  let result = "";
  const lines = text.split("\n");
  result += lines[posStart.row];
  result += "\n";
  result +=
    (posStart.col ? " ".padStart(posStart.col) : "") +
    `^`.repeat(posEnd.col - posStart.col);
  return result;
}

class CEAddressStringError {
  constructor(
    public errorName: string,
    public posStart: Position,
    public posEnd: Position,
    public message: string
  ) {}

  toString() {
    let err = `${this.errorName}: ${this.message}\n`;
    err += `\trow(${this.posStart.row}), col(${this.posStart.col})\n\n`;
    err += stringsWithArrows(this.posStart.text, this.posStart, this.posEnd);
    err += "\n";
    return err;
  }
}

class IllegalCharError extends CEAddressStringError {
  constructor(posStart: Position, posEnd: Position, message: string) {
    super("Illegal Char Error", posStart, posEnd, message);
  }
}

class InvalidSyntaxError extends CEAddressStringError {
  constructor(posStart: Position, posEnd: Position, message: string) {
    super("Invalid Syntax Error", posStart, posEnd, message);
  }
}

class RuntimeError extends CEAddressStringError {
  constructor(posStart: Position, posEnd: Position, message: string) {
    super("Runtime Error", posStart, posEnd, message);
  }
}

class Token {
  posStart: Position;
  posEnd: Position;

  constructor(
    public type: string,
    public value: string | null,
    posStart: Position,
    posEnd?: Position
  ) {
    this.posStart = posStart.copy();

    if (posEnd) {
      this.posEnd = posEnd.copy();
    } else {
      this.posEnd = posStart.copy();
      this.posEnd.advance("");
    }
  }

  toString() {
    return this.value !== null ? `${this.type}:${this.value}` : `${this.type}`;
  }
}

class Lexer {
  pos = new Position(-1, 0, -1, this.text);
  curChar?: string = null;
  constructor(public text: string) {
    this.advance();
  }

  advance() {
    this.pos.advance(this.curChar);
    if (this.pos.index < this.text.length) {
      this.curChar = this.text[this.pos.index];
    } else {
      this.curChar = null;
    }
  }

  makeTokens(): Token[] {
    const tokens: Token[] = [];

    while (this.curChar !== null) {
      switch (this.curChar) {
        case " ":
        case "\t":
          this.advance();
          break;

        case "+":
          tokens.push(new Token(TT_PLUS, "+", this.pos));
          this.advance();
          break;

        case "-":
          tokens.push(new Token(TT_MINUS, "-", this.pos));
          this.advance();
          break;

        case "*":
          tokens.push(this.makeMulOrPow());
          break;

        case "/":
          tokens.push(new Token(TT_DIV, "/", this.pos));
          this.advance();
          break;

        case "(":
          tokens.push(new Token(TT_LPAREN, "(", this.pos));
          this.advance();
          break;

        case ")":
          tokens.push(new Token(TT_RPAREN, ")", this.pos));
          this.advance();
          break;

        case "[":
          tokens.push(new Token(TT_LSQUARE, "[", this.pos));
          this.advance();
          break;

        case "]":
          tokens.push(new Token(TT_RSQUARE, "]", this.pos));
          this.advance();
          break;

        case '"':
        case "'":
          this.makeString(tokens);
          break;

        default:
          if (!MODULE_OR_SYMBOL_TEXT.test(this.curChar)) {
            tokens.push(this.makeModuleOrSymbolOrHex());
            break;
          }

          const posStart = this.pos.copy();
          const c = this.curChar;
          this.advance();
          throw new IllegalCharError(posStart, this.pos, c).toString();
          break;
      }
    }

    tokens.push(new Token(TT_EOF, null, this.pos));
    return tokens;
  }

  makeModuleOrSymbolOrHex() {
    let str = "";
    let method = "";
    let type = TT_SYMBOL;
    const posStart = this.pos.copy();

    while (this.curChar !== null && !MODULE_OR_SYMBOL_TEXT.test(this.curChar)) {
      if (type === TT_MODULE) method += this.curChar;

      if (this.curChar === ".") {
        type = TT_MODULE;
      }
      str += this.curChar;
      this.advance();
    }

    // 优先级: SYMBOL > HEX > METHOD
    if (type === TT_SYMBOL && !SYMBOL_TABLE.hasOwnProperty(str)) {
      let hexStr = str;
      if (hexStr.startsWith("0x")) hexStr = hexStr.substr(2);

      if (!HEX_TEXT.test(hexStr)) {
        type = TT_HEX;
      } else {
        type = TT_METHOD;
      }
    }

    // is MODULE_NAME.METHOD?
    method = method.toLowerCase();
    if (type === TT_MODULE && !PE_FILE.includes(method)) type = TT_MMETHOD;

    return new Token(type, str, posStart, this.pos);
  }

  makeMulOrPow() {
    const posStart = this.pos.copy();
    let tokenType = TT_MUL;
    let value = "*";

    this.advance();
    if (this.curChar === "*") {
      this.advance();
      tokenType = TT_POW;
      value += "*";
    }
    return new Token(tokenType, value, posStart, this.pos);
  }

  /**
   * "user32.dll"
   * "user32.MessageBoxA"
   * "MessageBoxA"
   * "s1"
   * "1+1" => 2
   *
   * ## error
   * "user32.dll+1"
   * "user32.MessageBoxA+1"
   * "MessageBoxA+1"
   * "s1+1"
   */
  makeString(tokens: Token[]): void {
    let str = "";
    let type = TT_MODULE;
    const s = this.curChar; // " or '
    const posStart = this.pos.copy();

    this.advance();
    while (this.curChar !== null && this.curChar !== s) {
      str += this.curChar;
      this.advance();
    }
    this.advance();

    if (str.includes(".")) {
      const [_module, _method] = str.split(".");
      if (!PE_FILE.includes(_method)) type = TT_MMETHOD;
    } else {
      if (SYMBOL_TABLE.hasOwnProperty(str)) {
        type = TT_SYMBOL;
      } else if (/[\+\-\*\/]/.test(str)) {
        const lexer = new Lexer(str);
        const _tokens = lexer.makeTokens();
        for (const tok of _tokens) tokens.push(tok);
        return;
      } else {
        type = TT_METHOD;
      }
    }

    tokens.push(new Token(type, str, posStart, this.pos));
  }
}

abstract class CEAddressStringNode {
  constructor(public posStart: Position, public posEnd: Position) {}
}

class ModuleNode extends CEAddressStringNode {
  constructor(public token: Token) {
    super(token.posStart, token.posEnd);
  }
}

class SymbolNode extends CEAddressStringNode {
  constructor(public token: Token) {
    super(token.posStart, token.posEnd);
  }
}

class HexNode extends CEAddressStringNode {
  constructor(public token: Token) {
    super(token.posStart, token.posEnd);
  }
}

class MMethodNode extends CEAddressStringNode {
  constructor(public token: Token) {
    super(token.posStart, token.posEnd);
  }
}

class MethodNode extends CEAddressStringNode {
  constructor(public token: Token) {
    super(token.posStart, token.posEnd);
  }
}

class UnaryOpNode extends CEAddressStringNode {
  constructor(public token: Token, public node: CEAddressStringNode) {
    super(token.posStart, node.posEnd);
  }
}

class BinOpNode extends CEAddressStringNode {
  constructor(
    public leftNode: CEAddressStringNode,
    public token: Token,
    public rightNode: CEAddressStringNode
  ) {
    super(leftNode.posStart, rightNode.posEnd);
  }
}

class PointerNode extends CEAddressStringNode {
  constructor(public node: CEAddressStringNode) {
    super(node.posStart, node.posEnd);
  }
}

class Parser {
  index = -1;
  curToken?: Token = null;
  constructor(public tokens: Token[]) {
    this.advance();
  }

  advance() {
    this.index++;
    if (this.index < this.tokens.length) {
      this.curToken = this.tokens[this.index];
    } else {
      this.curToken = null;
    }
  }

  parse() {
    const pointer = this.expr();

    if (this.curToken.type !== TT_EOF) {
      throw new InvalidSyntaxError(
        this.curToken.posStart,
        this.curToken.posEnd,
        "Wrong EOF"
      ).toString();
    }

    return pointer;
  }

  expr(): CEAddressStringNode {
    let leftNode = this.term();

    while (this.curToken.type === TT_PLUS || this.curToken.type === TT_MINUS) {
      const token = this.curToken;
      this.advance();
      let rightNode = this.term();

      leftNode = new BinOpNode(leftNode, token, rightNode);
    }

    return leftNode;
  }

  term(): CEAddressStringNode {
    let leftNode = this.factor();

    while (this.curToken.type === TT_MUL || this.curToken.type === TT_DIV) {
      const token = this.curToken;
      this.advance();
      let rightNode = this.factor();

      leftNode = new BinOpNode(leftNode, token, rightNode);
    }

    return leftNode;
  }

  factor(): CEAddressStringNode {
    const token = this.curToken;

    if (token.type === TT_PLUS || token.type === TT_MINUS) {
      this.advance();
      return new UnaryOpNode(token, this.factor());
    }

    return this.power();
  }

  power() {
    let leftNode = this.atom();

    while (this.curToken.type === TT_POW) {
      const token = this.curToken;
      this.advance();
      let rightNode = this.factor();
      leftNode = new BinOpNode(leftNode, token, rightNode);
    }

    return leftNode;
  }

  atom() {
    const token = this.curToken;

    if (token.type === TT_MODULE) {
      this.advance();
      return new ModuleNode(token);
    } else if (token.type === TT_SYMBOL) {
      this.advance();
      return new SymbolNode(token);
    } else if (token.type === TT_HEX) {
      this.advance();
      return new HexNode(token);
    } else if (token.type === TT_MMETHOD) {
      this.advance();
      return new MMethodNode(token);
    } else if (token.type === TT_METHOD) {
      this.advance();
      return new MethodNode(token);
    } else if (token.type === TT_LPAREN) {
      this.advance();
      const _expr = this.expr();
      if (this.curToken.type === TT_RPAREN) {
        this.advance();
        return _expr;
      } else {
        throw new InvalidSyntaxError(
          this.curToken.posStart,
          this.curToken.posEnd,
          `Expected ')'`
        ).toString();
      }
    } else if (token.type === TT_LSQUARE) {
      this.advance();
      const _expr = this.expr();
      if (this.curToken.type === TT_RSQUARE) {
        this.advance();
        return new PointerNode(_expr);
      } else {
        throw new InvalidSyntaxError(
          this.curToken.posStart,
          this.curToken.posEnd,
          `Expected ']'`
        ).toString();
      }
    } else {
      throw new InvalidSyntaxError(
        token.posStart,
        token.posEnd,
        `Expected '+', '-', '*', '/', MODULE, SYMBOL, HEX or MODULE_NAME.METHOD`
      ).toString();
    }
  }
}

class Interpreter {
  visit(node: CEAddressStringNode): number {
    if (node instanceof HexNode) {
      return parseInt(node.token.value, 16);
    } else if (node instanceof SymbolNode) {
      return SYMBOL_TABLE[node.token.value];
    } else if (node instanceof ModuleNode) {
      return MODULE_TABLE[node.token.value];
    } else if (node instanceof MMethodNode) {
      const [module, method] = node.token.value.split(".");
      return MODULE_IMPOT_TABLE[module][method] ?? 0;
    } else if (node instanceof MethodNode) {
      const _modules: string[] = Object.keys(MODULE_IMPOT_TABLE);
      for (const moduleName of _modules) {
        const _methods: string[] = Object.keys(MODULE_IMPOT_TABLE[moduleName]);
        if (_methods.includes(node.token.value)) {
          return MODULE_IMPOT_TABLE[moduleName][node.token.value];
        }
      }

      throw new RuntimeError(
        node.posStart,
        node.posEnd,
        `Not defined symbol "${node.token.value}"`
      ).toString();
    } else if (node instanceof UnaryOpNode) {
      const value = this.visit(node.node);
      if (node.token.type === TT_MINUS) {
        return value * -1;
      }

      return value;
    } else if (node instanceof PointerNode) {
      const address: number = this.visit(node.node);
      // TODO: 无法读取内存，返回硬编码 0xce
      // TODO: 如果使用c++, 则可以读取4字节或则8字节的指针
      return 0xce;
    } else if (node instanceof BinOpNode) {
      const left: number = this.visit(node.leftNode);
      const right: number = this.visit(node.rightNode);

      switch (node.token.type) {
        case TT_PLUS:
          return left + right;
        case TT_MINUS:
          return left - right;
        case TT_MUL:
          return left * right;
        case TT_DIV:
          if (right === 0) {
            throw "Division by zero";
          }
          return left / right;
        case TT_POW:
          return left ** right;
      }
    } else {
      throw new RuntimeError(
        node.posStart,
        node.posEnd,
        `Unexpected CEAddressStringNode`
      ).toString();
    }
  }
}

export function getAddress(text: string): number {
  const lexer = new Lexer(text);
  const tokens = lexer.makeTokens();
  console.log(tokens.map((it) => it.toString()));

  const parser = new Parser(tokens);
  const nodeAST = parser.parse();

  const interpreter = new Interpreter();
  const pointer = interpreter.visit(nodeAST);
  if (pointer < 0) throw "Pointer will not be negative";
  return pointer;
}
