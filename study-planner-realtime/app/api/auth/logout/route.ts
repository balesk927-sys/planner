import { NextResponse } from "next/server";
import { endEditorSession } from "@/lib/auth";
export async function POST(){await endEditorSession();return NextResponse.json({ok:true});}
