const IDENT_INSTR_TEXT = /[\u4e00-\u9fa5\w\-\+\='&\(\)\[\]\s]/i;
const IDENT_TEXT = /[\u4e00-\u9fa5\w\='&]/i;
const HEX_TEXT = /[\da-f]/i;

export enum TT {
  HEX = "HEX",

  PLUS = "PLUS", // +
  MINUS = "MINUS", // -
  MUL = "MUL", // *
  POW = "POW", // **
  DIV = "DIV", // /

  LPAREN = "LPAREN", // (
  RPAREN = "RPAREN", // )
  LSQUARE = "LSQUARE", // [
  RSQUARE = "RSQUARE", // ]

  IDENT = "IDENT",
  DOT = "DOT", // .
  EOF = "EOF",
}

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
  c?: string = null;

  // string 模式下不会解析符号
  // "=+(][x)&.exe"   =>  IDENT:=+(][x)& DOT:. IDENT:exe
  // "'a&a.txt"   => IDENT:'a&a DOT:. IDENT:exe
  // 123.exe  => HEX:123 DOT:. IDENT:exe
  // "123.exe"  => IDENT:123 DOT:. IDENT:exe
  inString: boolean = false;

  constructor(public text: string) {
    this.advance();
  }

  advance() {
    this.pos.advance(this.c);
    if (this.pos.index < this.text.length) {
      this.c = this.text[this.pos.index];
    } else {
      this.c = null;
    }
  }

  makeTokens(): Token[] {
    const tokens: Token[] = [];

    while (this.c !== null) {
      if (this.inString) {
        if (this.c === ".") {
          tokens.push(new Token(TT.DOT, ".", this.pos));
          this.advance();
        } else if (this.c === '"') {
          this.inString = !this.inString;
          this.advance();
        } else if (IDENT_INSTR_TEXT.test(this.c)) {
          tokens.push(this.makeIdent(IDENT_INSTR_TEXT));
        } else {
          const posStart = this.pos.copy();
          const c = this.c;
          this.advance();
          throw new IllegalCharError(posStart, this.pos, c).toString();
        }
      } else {
        switch (this.c) {
          case " ":
          case "\t":
          case "\r":
          case "\n":
            this.advance();
            break;

          case ".":
            tokens.push(new Token(TT.DOT, ".", this.pos));
            this.advance();
            break;

          case "+":
            tokens.push(new Token(TT.PLUS, "+", this.pos));
            this.advance();
            break;

          case "-":
            tokens.push(new Token(TT.MINUS, "-", this.pos));
            this.advance();
            break;

          case "*":
            const start = this.pos.copy();
            this.advance();
            if (this.c === "*") {
              this.advance();
              tokens.push(new Token(TT.POW, "**", start, this.pos));
            } else {
              tokens.push(new Token(TT.MUL, "*", start, this.pos));
            }
            break;

          case "/":
            tokens.push(new Token(TT.DIV, "/", this.pos));
            this.advance();
            break;

          case "(":
            tokens.push(new Token(TT.LPAREN, "(", this.pos));
            this.advance();
            break;

          case ")":
            tokens.push(new Token(TT.RPAREN, ")", this.pos));
            this.advance();
            break;

          case "[":
            tokens.push(new Token(TT.LSQUARE, "[", this.pos));
            this.advance();
            break;

          case "]":
            tokens.push(new Token(TT.RSQUARE, "]", this.pos));
            this.advance();
            break;

          case '"':
            this.inString = !this.inString;
            this.advance();
            break;

          // 以数字开始，解析为HEX
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            tokens.push(this.makeHex());
            break;

          default:
            if (IDENT_TEXT.test(this.c)) {
              tokens.push(this.makeIdent(IDENT_TEXT));
              break;
            }

            const posStart = this.pos.copy();
            const c = this.c;
            this.advance();
            throw new IllegalCharError(posStart, this.pos, c).toString();
            break;
        }
      }
    }

    tokens.push(new Token(TT.EOF, null, this.pos));
    return tokens;
  }

  makeHex() {
    let str = this.c;
    const posStart = this.pos.copy();

    const getHex = () => {
      while (this.c !== null && HEX_TEXT.test(this.c)) {
        str += this.c;
        this.advance();
      }
    };

    this.advance();

    if ((this.c as string) === "x") {
      str += this.c;
      this.advance();
      getHex();
    } else getHex();

    return new Token(TT.HEX, str, posStart, this.pos);
  }

  makeIdent(exp: RegExp) {
    let str = "";
    const posStart = this.pos.copy();

    while (this.c !== null && exp.test(this.c)) {
      str += this.c;
      this.advance();
    }
    return new Token(TT.IDENT, str, posStart, this.pos);
  }
}

abstract class BaseNode {
  constructor(public posStart: Position, public posEnd: Position) {}
}

class IdentsNode extends BaseNode {
  constructor(public tokens: Token[]) {
    super(tokens[0].posStart, tokens[tokens.length - 1].posEnd);
  }
}

class HexNode extends BaseNode {
  constructor(public token: Token) {
    super(token.posStart, token.posEnd);
  }
}

class UnaryNode extends BaseNode {
  constructor(public op: Token, public node: BaseNode) {
    super(op.posStart, node.posEnd);
  }
}

class BinaryNode extends BaseNode {
  constructor(
    public leftNode: BaseNode,
    public op: Token,
    public rightNode: BaseNode
  ) {
    super(leftNode.posStart, rightNode.posEnd);
  }
}

class PointerNode extends BaseNode {
  constructor(public node: BaseNode) {
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

  getUnaryOperatorPrecedence(token: Token): number {
    if (token.type == TT.PLUS || token.type == TT.MINUS) {
      return 17;
    }
    return 0;
  }

  getBinaryOperatorPrecedence(token: Token): number {
    if (token.type == TT.POW) {
      return 16;
    }

    if (token.type == TT.MUL || token.type == TT.DIV) {
      return 15;
    }

    if (token.type == TT.PLUS || token.type == TT.MINUS) {
      return 14;
    }

    return 0;
  }

  parse() {
    const pointer = this.binaryExpr();

    if (this.curToken.type !== TT.EOF) {
      throw new InvalidSyntaxError(
        this.curToken.posStart,
        this.curToken.posEnd,
        "Wrong EOF"
      ).toString();
    }

    return pointer;
  }

  binaryExpr(parentPrecedence: number = 0): BaseNode {
    let left: BaseNode;

    const unaryPrecedence: number = this.getUnaryOperatorPrecedence(
      this.curToken
    );
    if (unaryPrecedence != 0 && unaryPrecedence >= parentPrecedence) {
      left = this.unaryExpr();
    } else {
      left = this.atom();
    }

    while (true) {
      const precedence: number = this.getBinaryOperatorPrecedence(
        this.curToken
      );
      if (precedence == 0 || precedence <= parentPrecedence) break;

      const op = this.curToken;
      this.advance();
      const right: BaseNode = this.binaryExpr(precedence);
      left = new BinaryNode(left, op, right);
    }

    return left;
  }

  unaryExpr(): BaseNode {
    const op = this.curToken;
    this.advance();
    const _node = this.atom();
    return new UnaryNode(op, _node);
  }

  atom() {
    const token = this.curToken;

    if (token.type === TT.HEX) {
      this.advance();
      return new HexNode(token);
    }

    if (token.type === TT.IDENT) {
      this.advance();

      const tokens = [token];
      while (this.curToken.type === TT.DOT) {
        this.advance();
        tokens.push(this.curToken);
        this.advance();
      }
      return new IdentsNode(tokens);
    }

    if (token.type === TT.LPAREN) {
      this.advance();
      const _expr = this.binaryExpr();
      if (this.curToken.type === TT.RPAREN) {
        this.advance();
        return _expr;
      } else {
        throw new InvalidSyntaxError(
          this.curToken.posStart,
          this.curToken.posEnd,
          `Expected ')'`
        ).toString();
      }
    }

    if (token.type === TT.LSQUARE) {
      this.advance();
      const _expr = this.binaryExpr();
      if (this.curToken.type === TT.RSQUARE) {
        this.advance();
        return new PointerNode(_expr);
      } else {
        throw new InvalidSyntaxError(
          this.curToken.posStart,
          this.curToken.posEnd,
          `Expected ']'`
        ).toString();
      }
    }

    throw new InvalidSyntaxError(
      token.posStart,
      token.posEnd,
      `Invalid token`
    ).toString();
  }
}

class Interpreter {
  visit(node: BaseNode): number {
    if (node instanceof HexNode) {
      return parseInt(node.token.value, 16);
    } else if (node instanceof IdentsNode) {
      // 优先级 SYMBOL -> HEX -> MODULE
      const idents = node.tokens;
      if (idents.length === 1) {
        const val = idents[0].value;
        // symbol -> hex -> method
        if (SYMBOL_TABLE.hasOwnProperty(val)) {
          return SYMBOL_TABLE[idents[0].value];
        } else if (!/[^\da-f]/i.test(val)) {
          return parseInt(val, 16);
        } else {
          const _modules: string[] = Object.keys(MODULE_IMPOT_TABLE);
          for (const moduleName of _modules) {
            const _methods: string[] = Object.keys(
              MODULE_IMPOT_TABLE[moduleName]
            );
            if (_methods.includes(val)) {
              return MODULE_IMPOT_TABLE[moduleName][val];
            }
          }
          throw new RuntimeError(
            node.posStart,
            node.posEnd,
            `Not defined symbol "${val}"`
          ).toString();
        }
      } else {
        const last: string = idents.pop().value;
        const first = idents.map((t) => t.value).join(".");

        // 先在模块找method，没找到在直接找模块
        // user32.messageboxa
        // user32.dll
        let r: number = MODULE_IMPOT_TABLE[first]
          ? MODULE_IMPOT_TABLE[first][last] ?? 0
          : 0;
        if (!r) {
          const module = `${first}.${last}`;
          r = MODULE_TABLE[module];
        }

        if (!r) {
          throw new RuntimeError(
            node.posStart,
            node.posEnd,
            `Not find "${first}.${last}"`
          ).toString();
        }

        return r;
      }
    } else if (node instanceof UnaryNode) {
      const value = this.visit(node.node);
      if (node.op.type === TT.MINUS) {
        return value * -1;
      }

      return value;
    } else if (node instanceof PointerNode) {
      const address: number = this.visit(node.node);
      // TODO: 无法读取内存，返回硬编码 0xce
      // TODO: 如果使用c++, 则可以读取4字节或则8字节的指针
      return 0xce;
    } else if (node instanceof BinaryNode) {
      const left: number = this.visit(node.leftNode);
      const right: number = this.visit(node.rightNode);

      switch (node.op.type) {
        case TT.PLUS:
          return left + right;
        case TT.MINUS:
          return left - right;
        case TT.MUL:
          return left * right;
        case TT.DIV:
          if (right === 0) throw "Division by zero";
          return left / right;
        case TT.POW:
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
  // console.log(nodeAST);

  const interpreter = new Interpreter();
  const pointer = interpreter.visit(nodeAST);
  if (pointer < 0) throw "Pointer will not be negative";
  return pointer;
}
