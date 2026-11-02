import { dispatch } from "@/server/api/router";
import "@/server/api/routes";

// O reset da demonstração e o agendador passam dos 10s padrão da Vercel
export const maxDuration = 60;

type Params = { params: Promise<{ path: string[] }> };

const handle = async (req: Request, { params }: Params) => dispatch(req, (await params).path);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
