import { dispatch } from "@/server/api/router";
import "@/server/api/routes";

type Params = { params: Promise<{ path: string[] }> };

const handle = async (req: Request, { params }: Params) => dispatch(req, (await params).path);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
