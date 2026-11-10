import { NextResponse } from "next/server";
import { hasEditorSession } from "@/lib/auth";
export async function GET(){return NextResponse.json({editor:await hasEditorSession()});}
