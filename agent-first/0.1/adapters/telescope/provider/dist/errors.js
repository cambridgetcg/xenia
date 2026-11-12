export class TargetInputError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "TargetInputError";
        this.code = code;
    }
}
export class NetworkPolicyError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "NetworkPolicyError";
        this.code = code;
    }
}
export class LimitError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "LimitError";
        this.code = code;
    }
}
//# sourceMappingURL=errors.js.map