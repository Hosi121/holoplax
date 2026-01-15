import { NextResponse } from "next/server";
import { AuthError } from "./api-auth";

export const ok = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, init);

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const unauthorized = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 });

export const forbidden = () =>
  NextResponse.json({ error: "forbidden" }, { status: 403 });

export const notFound = (message = "not found") =>
  NextResponse.json({ error: message }, { status: 404 });

export const conflict = (message: string) =>
  NextResponse.json({ error: message }, { status: 409 });

export const serverError = (message: string) =>
  NextResponse.json({ error: message }, { status: 500 });

export const handleAuthError = (error: unknown) =>
  error instanceof AuthError ? unauthorized() : null;
