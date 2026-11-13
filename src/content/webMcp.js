const MAX_LIST_LENGTH = 5_000;
const MAX_RESULT_LENGTH = 5_000;
const MAX_INPUT_LENGTH = 16_000;

// Keep the browser's RegisteredTool objects in the content script. The model
// only receives metadata and handles from the current list.
export function createWebMcpSession(signal) {
  let tools = new Map();
  let sequence = 0;

  const getContext = () => {
    const context = document.modelContext;
    return typeof context?.getTools === "function" && typeof context?.executeTool === "function"
      ? context
      : null;
  };

  const list = async ({ offset = 0 } = {}) => {
    tools = new Map();
    const context = getContext();
    if (!context) return { available: false, tools: [] };
    if (!Number.isSafeInteger(offset) || offset < 0) return { error: "offset 必须是非负整数。" };

    const registered = (await context.getTools()).filter((tool) =>
      tool.origin === location.origin && !tool.annotations?.debugging
    );
    if (signal.aborted) return { error: "本轮对话已停止。" };
    const descriptors = [];
    let totalLength = 0;
    let index = offset;
    for (; index < registered.length; index += 1) {
      const tool = registered[index];
      const toolId = `webmcp-${sequence + 1}`;
      const schemaLength = JSON.stringify(tool.inputSchema)?.length || 0;
      const descriptor = {
        toolId,
        name: tool.name.slice(0, 160),
        description: tool.description.slice(0, 500),
        origin: tool.origin,
        inputSchema: schemaLength <= 3_500 ? tool.inputSchema : undefined,
        schemaOmitted: schemaLength > 3_500 || undefined,
        readOnlyHint: tool.annotations?.readOnlyHint === true,
        consequentialHint: tool.annotations?.consequentialHint === true
      };
      const length = JSON.stringify(descriptor).length;
      if (totalLength + length > MAX_LIST_LENGTH) break;
      totalLength += length;
      sequence += 1;
      tools.set(toolId, tool);
      descriptors.push(descriptor);
    }

    return {
      available: true,
      tools: descriptors,
      nextOffset: index < registered.length ? index : undefined
    };
  };

  const call = async ({ toolId, input = {} } = {}) => {
    const action = "webmcp_call";
    const tool = tools.get(toolId);
    if (!tool) return { action, error: "WebMCP 工具 ID 已失效，请重新列出当前页面的工具。" };
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { action, error: "WebMCP 工具参数必须是 JSON 对象。" };
    }
    const inputJson = JSON.stringify(input);
    if (inputJson.length > MAX_INPUT_LENGTH) return { action, error: "WebMCP 工具参数过长。" };
    if (signal.aborted) return { action, error: "本轮对话已停止。" };
    const context = getContext();
    if (!context) return { action, error: "当前页面的 WebMCP 接口不可用。" };

    const timeout = AbortSignal.timeout(15_000);
    const options = { signal: AbortSignal.any([signal, timeout]) };
    try {
      let raw;
      try {
        raw = await context.executeTool(tool, input, options);
      } catch (error) {
        // Older Chrome versions take a JSON string. Only retry a parse error
        // raised before dispatch so a website action cannot run twice.
        if (!error?.message?.startsWith("Failed to parse input")) throw error;
        raw = await context.executeTool(tool, inputJson, options);
      }
      let result = raw;
      if (typeof raw === "string") {
        try { result = JSON.parse(raw); } catch {}
      }
      const failed = result?.isError === true || Boolean(result?.error);
      const truncated = (JSON.stringify(result)?.length || 0) > MAX_RESULT_LENGTH;
      return {
        action,
        actionExecuted: true,
        ok: !failed,
        result: truncated ? String(raw).slice(0, 800) : result,
        truncated: truncated || undefined,
        error: failed ? "网站工具返回了错误，请查看其结果。" : undefined
      };
    } catch {
      return {
        action,
        actionExecuted: true,
        error: signal.aborted || timeout.aborted
          ? "WebMCP 调用已停止或超时，请先确认页面状态。"
          : "网站工具执行失败或已失效，请先确认页面状态。"
      };
    }
  };

  return { list, call };
}
