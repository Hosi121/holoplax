export const DELEGATION_MODE = {
  PREPARE: "PREPARE",
  SAFE_AUTO: "SAFE_AUTO",
} as const;

export type DelegationMode = (typeof DELEGATION_MODE)[keyof typeof DELEGATION_MODE];

export const DELEGATION_KIND = {
  RESEARCH: "RESEARCH",
  WRITING: "WRITING",
  CODE: "CODE",
  GENERAL: "GENERAL",
} as const;

export type DelegationKind = (typeof DELEGATION_KIND)[keyof typeof DELEGATION_KIND];

export const DELEGATION_RISK = {
  LOW: "LOW",
  REVIEW: "REVIEW",
  RESTRICTED: "RESTRICTED",
} as const;

export type DelegationRisk = (typeof DELEGATION_RISK)[keyof typeof DELEGATION_RISK];

export type DelegationDecision =
  | { outcome: "AUTO" }
  | { outcome: "REVIEW"; reason: string; safeFallback: "PREPARE" }
  | { outcome: "BLOCK"; reason: string };

export type DelegationPlan = {
  kind: DelegationKind;
  risk: DelegationRisk;
  decision: DelegationDecision;
  steps: string[];
  completionCriteria: string[];
};

const destructiveOrIrreversible =
  /(?:削除して|消去して|解約して|購入して|支払って|送金して|マージして|merge\b|デプロイして|deploy\b|公開して|投稿して|招待して|権限を変更|drop\s+table|rm\s+-rf)|\b(?:delete|purchase|pay|transfer|publish|post|invite)\b/i;

const externalSideEffect =
  /(?:送って|送信して|メールして|連絡して|返信して|通知して|共有して|リマインドして|予約して|登録して|更新して|アップロードして|ファイルを変更|コードを実装|コードを修正|テストを実行|コミットして|プッシュして|APIを(?:叩|呼)|GitHubに|Slackに|Discordに|カレンダーに)|\b(?:send|schedule|book|execute|run|write\s+to|call\s+the\s+api|open\s+a\s+pr|commit|push|upload|notify|remind)\b/i;

const sensitiveMaterial =
  /(?:(?:パスワード|秘密鍵|認証情報|APIキー|クレジットカード)(?:\s*(?:[:：=]\s*\S+|を使(?:って|い)))|(?:個人情報|顧客情報)(?:を(?:使|含|要約|整理|送)|\s*[:：=])|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[a-z0-9_-]{16,}|\b(?:password|secret|credential|api\s*key|credit\s*card)\s*(?::|=|is\b)\s*\S+)/i;

const researchWords =
  /(?:調べ|調査|比較|要約|まとめ|リサーチ|情報収集)|\b(?:research|compare|summari[sz]e|investigate)\b/i;
const writingWords =
  /(?:文章|文書|下書き|メール文|記事|説明文|議事録|仕様書|レポート)|\b(?:draft|write|document|report|email\s+copy)\b/i;
const codeWords =
  /(?:コード|実装|修正|リファクタ|テスト|バグ|GitHub|プルリクエスト)|\b(?:code|implement|refactor|test|bug|github|pull\s+request)\b/i;

const kindForRequest = (request: string): DelegationKind => {
  if (codeWords.test(request)) return DELEGATION_KIND.CODE;
  if (researchWords.test(request)) return DELEGATION_KIND.RESEARCH;
  if (writingWords.test(request)) return DELEGATION_KIND.WRITING;
  return DELEGATION_KIND.GENERAL;
};

const stepsForKind = (kind: DelegationKind) => {
  switch (kind) {
    case DELEGATION_KIND.RESEARCH:
      return ["依頼の論点を整理する", "分かっている事実と前提を分ける", "結論と注意点をまとめる"];
    case DELEGATION_KIND.WRITING:
      return ["目的と読み手を整理する", "そのまま使える文章を作る", "抜けや曖昧さを点検する"];
    case DELEGATION_KIND.CODE:
      return ["変更目的と制約を整理する", "具体的な変更案を作る", "必要な検証方法を示す"];
    default:
      return ["依頼を小さな作業に分ける", "安全に作れる成果物を作る", "完了条件に照らして点検する"];
  }
};

const completionCriteriaForKind = (kind: DelegationKind) => {
  switch (kind) {
    case DELEGATION_KIND.RESEARCH:
      return ["依頼への結論が明記されている", "不確かな点と追加確認事項が区別されている"];
    case DELEGATION_KIND.WRITING:
      return ["依頼された用途にそのまま使える", "重要な前提や空欄が明示されている"];
    case DELEGATION_KIND.CODE:
      return ["変更箇所と期待結果が具体的である", "検証手順が含まれている"];
    default:
      return ["依頼に対する具体的な成果物がある", "次に人が行う必要がある操作が明示されている"];
  }
};

/**
 * Conservative, deterministic safety gate. The model may improve a plan, but
 * it can never lower this risk classification or authorize an external side effect.
 */
export function planDelegationRequest(
  rawRequest: string,
  mode: DelegationMode = DELEGATION_MODE.SAFE_AUTO,
): DelegationPlan {
  const request = rawRequest.trim();
  const kind = kindForRequest(request);
  const destructive = destructiveOrIrreversible.test(request);
  const sensitive = sensitiveMaterial.test(request);
  const needsTool = externalSideEffect.test(request);
  const prepareOnly = mode === DELEGATION_MODE.PREPARE;
  const risk = sensitive
    ? DELEGATION_RISK.RESTRICTED
    : prepareOnly
      ? DELEGATION_RISK.LOW
      : destructive
        ? DELEGATION_RISK.RESTRICTED
        : needsTool
          ? DELEGATION_RISK.REVIEW
          : DELEGATION_RISK.LOW;
  const decision: DelegationDecision = sensitive
    ? {
        outcome: "BLOCK",
        reason: "機密情報や個人情報が含まれている可能性があります。内容から取り除いてください。",
      }
    : !prepareOnly && destructive
      ? {
          outcome: "REVIEW",
          reason: "削除・公開・支払いなど、取り消しにくい操作が含まれています。",
          safeFallback: "PREPARE",
        }
      : !prepareOnly && needsTool
        ? {
            outcome: "REVIEW",
            reason: "外部サービスや実行環境を変更する操作が含まれています。",
            safeFallback: "PREPARE",
          }
        : { outcome: "AUTO" };

  return {
    kind,
    risk,
    decision,
    steps: stepsForKind(kind),
    completionCriteria: completionCriteriaForKind(kind),
  };
}
