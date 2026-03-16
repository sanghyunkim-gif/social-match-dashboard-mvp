import { NextResponse } from "next/server";
import type { ChatContext, AiChatAvailableOptions } from "@/app/types";

type ApiMessage = { role: "user" | "assistant" | "system"; content: string };

const MAX_BYTES = 200_000;
const MAX_HISTORY = 20;

const formatValue = (value: number | null, format: "number" | "percent") => {
  if (value === null || Number.isNaN(value)) return "-";
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString("ko-KR");
};

const formatDelta = (value: number | null, format: "number" | "percent") => {
  if (value === null || Number.isNaN(value)) return "-";
  const sign = value >= 0 ? "+" : "";
  if (format === "percent") return `${sign}${(value * 100).toFixed(1)}%p`;
  return `${sign}${value.toLocaleString("ko-KR")}`;
};

function buildSystemPrompt(
  availableOptions: AiChatAvailableOptions,
  dashboardContext: ChatContext | null
): string {
  const periodList = availableOptions.periodRanges
    .map((p) => `${p.label} (value: "${p.value}")`)
    .join(", ");

  const unitList = availableOptions.measurementUnits
    .map((u) => `${u.label} (value: "${u.value}")`)
    .join(", ");

  const metricList = availableOptions.metricOptions
    .map((m) => `${m.name} (id: "${m.id}")`)
    .join(", ");

  const filterList = availableOptions.filterOptions.length
    ? availableOptions.filterOptions.join(", ")
    : "없음 (전체 조회만 가능)";

  let contextBlock = "";
  if (dashboardContext) {
    const { weeks, metricSummaries, unit, filter } = dashboardContext;
    const rangeLabel = weeks.length ? `${weeks[0]} ~ ${weeks[weeks.length - 1]}` : "미조회";

    const metricsBlock = metricSummaries
      .map(
        (m) =>
          `- ${m.name} (${m.metricId}): 최신값 ${formatValue(m.latest, m.format)}, 전주 대비 ${formatDelta(m.delta, m.format)}`
      )
      .join("\n");

    contextBlock = `
## 현재 대시보드에 표시된 데이터
- 기간: ${rangeLabel} (${weeks.length}주)
- 분석 단위: ${unit}
- 필터: ${filter}

### 지표 현황
${metricsBlock}
`;
  }

  return `당신은 플랩풋볼(PLAB) 대시보드의 AI 어시스턴트 KEVIN입니다.
사용자와 대화하면서 원하는 분석 조건을 파악하고, 대시보드 필터를 자동으로 설정합니다.

## 핵심 규칙
1. 데이터를 직접 조회하지 않습니다. 대신 대시보드의 필터를 설정하여 데이터를 표시합니다.
2. 사용자가 분석을 요청하면, 필요한 조건(기간, 단위, 필터, 지표)을 대화로 확인한 후 필터를 적용합니다.
3. 이미 조건이 명확한 경우 바로 필터를 적용합니다. 모호한 경우에만 질문합니다.
4. 필터를 적용할 때는 반드시 응답 텍스트 끝에 JSON 블록을 포함합니다.

## 사용 가능한 옵션
- 기간: ${periodList}
- 분석 단위: ${unitList}
- 필터 옵션: ${filterList}
- 지표: ${metricList}

## 필터 적용 방법
필터를 적용하려면 응답 텍스트 끝에 다음 형식의 JSON을 포함하세요:
\`\`\`json:action
{
  "type": "apply_filters",
  "filters": {
    "periodRangeValue": "recent_8",
    "measurementUnit": "all",
    "filterValue": "__ALL__",
    "metricIds": ["progress_match_rate"]
  }
}
\`\`\`

- 변경이 필요한 필드만 포함하면 됩니다.
- filterValue가 전체인 경우 "__ALL__"을 사용하세요.
- metricIds는 반드시 위 지표 목록의 id 값을 사용하세요.

## 대시보드에 데이터가 표시된 후 분석 요청이 오면
데이터 컨텍스트를 기반으로 인사이트를 제공하세요:
- 추세 분석, 변동 원인 추정, 액션 아이템을 포함
- 간결하고 명확하게 답변
${contextBlock}
## 응답 가이드
- 한국어로 답변하세요
- 친절하지만 간결하게 대화하세요
- 추천 질문도 함께 제공하세요 (응답 끝에 "---추천---" 구분자 뒤에 줄바꿈으로 구분)`;
}

function parseAiResponse(text: string) {
  let reply = text;
  let action = undefined;
  let recommendations: string[] = [];

  // Parse action JSON block
  const actionRegex = /```json:action\s*\n([\s\S]*?)\n```/;
  const actionMatch = reply.match(actionRegex);
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1]);
      reply = reply.replace(actionRegex, "").trim();
    } catch {
      // ignore parse error
    }
  }

  // Parse recommendations
  const recoSplit = reply.split("---추천---");
  if (recoSplit.length > 1) {
    reply = recoSplit[0].trim();
    recommendations = recoSplit[1]
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return { reply, action, recommendations };
}

function buildFallback(
  availableOptions: AiChatAvailableOptions,
  dashboardContext: ChatContext | null,
  message: string
): { reply: string; recommendations: string[] } {
  if (dashboardContext) {
    const { weeks, metricSummaries, unit, filter } = dashboardContext;
    const rangeLabel = weeks.length ? `${weeks[0]} ~ ${weeks[weeks.length - 1]}` : "선택 기간";
    const primary = metricSummaries[0];

    const parts: string[] = [];
    parts.push(`현재 대시보드에 ${rangeLabel} (${weeks.length}주) 기간, ${unit} · ${filter} 데이터가 표시되어 있습니다.`);
    if (primary) {
      parts.push(`핵심 지표 ${primary.name}의 최신값은 ${formatValue(primary.latest, primary.format)}이고 전주 대비 ${formatDelta(primary.delta, primary.format)} 변화가 있습니다.`);
    }
    parts.push("더 구체적인 분석이 필요하시면 말씀해주세요.");

    return {
      reply: parts.join(" "),
      recommendations: [
        "지역별로 비교해줘",
        "추이가 나빠진 지표는?",
        "최근 12주로 변경해줘",
      ],
    };
  }

  return {
    reply: "어떤 데이터를 보고 싶으신가요? 기간, 지표, 지역 등을 말씀해주시면 대시보드에 바로 표시해드릴게요.",
    recommendations: [
      "전체 진행률 추이 보여줘",
      "강남 지역 최근 8주 데이터",
      "매치 로스율이 궁금해",
    ],
  };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BYTES) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }

    const parsed = JSON.parse(rawBody) as {
      messages?: ApiMessage[];
      message?: string;
      context?: ChatContext | null;
      availableOptions?: AiChatAvailableOptions;
    };

    const availableOptions = parsed.availableOptions ?? {
      periodRanges: [],
      measurementUnits: [],
      filterOptions: [],
      metricOptions: [],
    };
    const dashboardContext = parsed.context ?? null;

    const messages: ApiMessage[] = parsed.messages
      ? parsed.messages.slice(-MAX_HISTORY)
      : parsed.message
        ? [{ role: "user" as const, content: parsed.message }]
        : [];

    if (!messages.length) {
      return NextResponse.json({ error: "Missing messages." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      const lastUserMsg = messages.filter((m) => m.role === "user").pop();
      const fallback = buildFallback(availableOptions, dashboardContext, lastUserMsg?.content ?? "");
      return NextResponse.json(fallback);
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = buildSystemPrompt(availableOptions, dashboardContext);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const rawReply =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "응답을 생성하지 못했습니다.";

    const { reply, action, recommendations } = parseAiResponse(rawReply);

    return NextResponse.json({ reply, action, recommendations });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to build reply." },
      { status: 500 }
    );
  }
}
