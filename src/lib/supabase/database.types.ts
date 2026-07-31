/**
 * ⚠️ TEMPORARY, HAND-WRITTEN bootstrap types.
 *
 * This is a manual mirror of the Supabase Postgres schema (see
 * supabase/migrations/0001_init.sql), used only until the dedicated Supabase
 * project is created and linked. It is NOT generated and must not be treated
 * as the long-term source of truth.
 *
 * Replace it with generated types once the project is linked:
 *
 *   npm run gen:types
 *   # → supabase gen types typescript --linked --schema public > this file
 *
 * See README ("Database types") for the full procedure. Keeping it typed
 * (rather than `any`) gives end-to-end type safety without a live connection.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      series: {
        Row: {
          id: string;
          title: string;
          original_title: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          original_title?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          original_title?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      edition: {
        Row: {
          id: string;
          series_id: string;
          publisher: string | null;
          language: string | null;
          edition_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          series_id: string;
          publisher?: string | null;
          language?: string | null;
          edition_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          series_id?: string;
          publisher?: string | null;
          language?: string | null;
          edition_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edition_series_id_fkey";
            columns: ["series_id"];
            referencedRelation: "series";
            referencedColumns: ["id"];
          },
        ];
      };
      volume: {
        Row: {
          id: string;
          edition_id: string;
          volume_number: number;
          isbn: string | null;
          title: string | null;
          cover_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          edition_id: string;
          volume_number: number;
          isbn?: string | null;
          title?: string | null;
          cover_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          edition_id?: string;
          volume_number?: number;
          isbn?: string | null;
          title?: string | null;
          cover_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "volume_edition_id_fkey";
            columns: ["edition_id"];
            referencedRelation: "edition";
            referencedColumns: ["id"];
          },
        ];
      };
      owned_volume: {
        Row: {
          id: string;
          user_id: string;
          volume_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          volume_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          volume_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "owned_volume_volume_id_fkey";
            columns: ["volume_id"];
            referencedRelation: "volume";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
