/**
 * Tolerant parser for DATABASE_URL.
 *
 * Supabase database passwords often contain characters like "@", "#" or "/".
 * Pasted raw into a connection string they break standard URL parsing (the
 * host ends up wrong). We split on the LAST "@" so an unencoded password still
 * works, and accept a properly percent-encoded one too.
 */
export type DbParams = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a literal "%" in an unencoded password
  }
}

export function parseDatabaseUrl(raw: string): DbParams {
  const url = raw.trim().replace(/^["']|["']$/g, "");
  const scheme = url.match(/^postgres(?:ql)?:\/\//);
  if (!scheme) throw new Error("DATABASE_URL must start with postgresql://");
  const rest = url.slice(scheme[0].length);

  const at = rest.lastIndexOf("@");
  if (at === -1) throw new Error("DATABASE_URL is missing the user:password@ part");
  const userInfo = rest.slice(0, at);
  const hostPart = rest.slice(at + 1);

  const colon = userInfo.indexOf(":");
  const user = colon === -1 ? userInfo : userInfo.slice(0, colon);
  const password = colon === -1 ? "" : userInfo.slice(colon + 1);

  const m = hostPart.match(/^([^:/?#]+)(?::(\d+))?(?:\/([^?#]*))?/);
  if (!m) throw new Error("DATABASE_URL has no host");

  return {
    host: m[1],
    port: m[2] ? Number(m[2]) : 5432,
    database: m[3] ? safeDecode(m[3]) : "postgres",
    user: safeDecode(user),
    password: safeDecode(password),
  };
}
