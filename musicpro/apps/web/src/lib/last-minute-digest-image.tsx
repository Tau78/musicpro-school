import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { ImageResponse } from "next/og";

import {
  type DigestRoomName,
  DIGEST_ROOM_ORDER,
  formatDigestDateLabel,
  ROOM_ACCENT_HEX,
} from "@/lib/last-minute-digest-story";

const W = 1080;
const H = 1920;
const SAFE_X = 65;
const SAFE_W = 950;

const ALERT = "#F2453A";
const WHITE = "#ffffff";
const NAVY_PANEL = "rgba(10, 18, 32, 0.92)";

function resolveSchoolWorkspaceRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.join(cwd, ".."),
    path.join(cwd, "..", ".."),
    path.join(cwd, "..", "..", ".."),
  ];
  for (const root of candidates) {
    if (existsSync(path.join(root, "docs/assets/school/lm-digest-bg.jpg"))) {
      return root;
    }
  }
  return path.join(cwd, "..", "..", "..");
}

function loadAssetDataUri(relativePath: string): string {
  const root = resolveSchoolWorkspaceRoot();
  const abs = path.join(root, relativePath);
  const buf = readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".png"
        ? "image/png"
        : "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function loadFonts() {
  const root = resolveSchoolWorkspaceRoot();
  const read = (rel: string) => readFileSync(path.join(root, rel));
  return [
    {
      name: "Montserrat",
      data: read("docs/assets/school/fonts/Montserrat-Bold.ttf"),
      weight: 700 as const,
      style: "normal" as const,
    },
    {
      name: "Montserrat",
      data: read("docs/assets/school/fonts/Montserrat-ExtraBold.ttf"),
      weight: 800 as const,
      style: "normal" as const,
    },
    {
      name: "Bebas Neue",
      data: read("docs/assets/school/fonts/BebasNeue-Regular.ttf"),
      weight: 400 as const,
      style: "normal" as const,
    },
  ];
}

export interface RenderDigestImageInput {
  dayRome: string;
  columns: Record<DigestRoomName, string[]>;
}

export async function renderLastMinuteDigestPng(
  input: RenderDigestImageInput,
): Promise<Buffer> {
  const bgDataUri = loadAssetDataUri("docs/assets/school/lm-digest-bg.jpg");
  const fonts = await loadFonts();
  const dateLabel = formatDigestDateLabel(input.dayRome);
  const activeRooms = DIGEST_ROOM_ORDER.filter(
    (name) => input.columns[name].length > 0,
  );

  const subtitle =
    "Approfitta del LAST MINUTE per prenotare alcuni slot della sala prove.";

  const response = new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundColor: "#0c1828",
        }}
      >
        <img
          src={bgDataUri}
          alt=""
          width={W}
          height={H}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            background:
              "linear-gradient(90deg, rgba(12,24,40,0.92) 0%, rgba(12,24,40,0.55) 42%, rgba(12,24,40,0.15) 72%, rgba(12,24,40,0.05) 100%)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingTop: 252,
            paddingLeft: SAFE_X,
            paddingRight: SAFE_X,
            width: W,
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Bebas Neue",
              fontSize: 220,
              lineHeight: 0.92,
              letterSpacing: 2,
            }}
          >
            <span style={{ color: ALERT }}>LAST</span>
            <span style={{ color: WHITE }}>MINUTE</span>
          </div>
          <div
            style={{
              width: 160,
              height: 6,
              backgroundColor: ALERT,
              marginTop: 10,
              marginBottom: 22,
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Montserrat",
              fontWeight: 700,
              fontSize: 30,
              color: WHITE,
              lineHeight: 1.35,
              maxWidth: 620,
              marginBottom: 22,
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingLeft: 22,
              paddingRight: 22,
              paddingTop: 14,
              paddingBottom: 14,
              backgroundColor: ALERT,
              borderRadius: 28,
              alignSelf: "flex-start",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontFamily: "Montserrat",
                fontWeight: 800,
                fontSize: 26,
                color: WHITE,
              }}
            >
              IN APP MUSICPRO SCHOOL
            </span>
          </div>

          <div
            style={{
              fontFamily: "Montserrat",
              fontWeight: 700,
              fontSize: 24,
              color: ALERT,
              marginBottom: 6,
            }}
          >
            o sul sito
          </div>
          <div
            style={{
              fontFamily: "Montserrat",
              fontWeight: 700,
              fontSize: 24,
              color: WHITE,
              marginBottom: 20,
            }}
          >
            school.musicproeventi.it/prenotazioni
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              backgroundColor: NAVY_PANEL,
              borderRadius: 28,
              padding: 12,
              marginBottom: 48,
              minHeight: 520,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(10, 18, 32, 1)",
                borderRadius: 24,
                paddingTop: 18,
                paddingBottom: 18,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontFamily: "Bebas Neue",
                  fontSize: 96,
                  color: ALERT,
                  letterSpacing: 1,
                }}
              >
                {dateLabel}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flex: 1,
                gap: 18,
              }}
            >
              {activeRooms.map((room) => {
                const times = input.columns[room];
                const accent = ROOM_ACCENT_HEX[room];
                return (
                  <div
                    key={room}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      backgroundColor: "rgba(10, 18, 32, 1)",
                      borderRadius: 24,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: 56,
                        backgroundColor: accent,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "Montserrat",
                          fontWeight: 800,
                          fontSize: 26,
                          color: WHITE,
                        }}
                      >
                        {room.toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        justifyContent: "space-evenly",
                        paddingTop: 8,
                        paddingBottom: 8,
                      }}
                    >
                      {times.map((fascia, idx) => (
                        <div
                          key={`${room}-${idx}`}
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            flex: 1,
                            borderTop:
                              idx > 0 ? "2px solid rgba(255,255,255,0.14)" : "none",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "Bebas Neue",
                              fontSize: 52,
                              color: WHITE,
                              textAlign: "center",
                            }}
                          >
                            {fascia}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
    },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
