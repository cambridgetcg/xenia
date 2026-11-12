export function parseFailure(code) {
    return { ok: false, code };
}
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function readBoundedString(value, maxLength = 2_048) {
    return typeof value === "string" &&
        value.length > 0 &&
        value.length <= maxLength
        ? value
        : null;
}
export function isExactSemver(value) {
    return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}
export function isNpmPackageName(value) {
    if (value.length > 214 || value.toLowerCase() !== value)
        return false;
    if (value === "node_modules" || value === "favicon.ico")
        return false;
    return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/.test(value);
}
function validateJsonComplexity(value, limits) {
    let nodes = 0;
    const visit = (current, depth) => {
        nodes += 1;
        if (nodes > limits.max_json_nodes || depth > limits.max_json_depth) {
            return false;
        }
        if (Array.isArray(current)) {
            return current.every((entry) => visit(entry, depth + 1));
        }
        if (isRecord(current)) {
            return Object.values(current).every((entry) => visit(entry, depth + 1));
        }
        return true;
    };
    return visit(value, 0);
}
export function decodeUtf8(body) {
    try {
        return {
            ok: true,
            value: new TextDecoder("utf-8", { fatal: true }).decode(body),
            warnings: [],
        };
    }
    catch {
        return parseFailure("invalid_utf8");
    }
}
export function parseJsonBody(body, limits) {
    const decoded = decodeUtf8(body);
    if (!decoded.ok)
        return decoded;
    let value;
    try {
        value = JSON.parse(decoded.value);
    }
    catch {
        return parseFailure("invalid_json");
    }
    if (!validateJsonComplexity(value, limits)) {
        return parseFailure("json_complexity_limit");
    }
    return { ok: true, value, warnings: [] };
}
//# sourceMappingURL=common.js.map