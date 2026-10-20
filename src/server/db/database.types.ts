export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      currencies: {
        Row: {
          code: string;
          minor_unit: number;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          minor_unit: number;
          name: string;
        };
        Update: {
          code?: string;
          minor_unit?: number;
          name?: string;
        };
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          city: string | null;
          country_code: string;
          created_at: string;
          created_by: string | null;
          customer_id: string;
          id: string;
          is_default: boolean;
          label: string | null;
          line1: string;
          line2: string | null;
          line3: string | null;
          match_key: string | null;
          organization_id: string;
          postal_code: string | null;
          region: string | null;
          status: string;
          type: Database["public"]["Enums"]["address_type"];
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          city?: string | null;
          country_code: string;
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          line1: string;
          line2?: string | null;
          line3?: string | null;
          match_key?: never;
          organization_id: string;
          postal_code?: string | null;
          region?: string | null;
          status?: string;
          type: Database["public"]["Enums"]["address_type"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          city?: string | null;
          country_code?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          line1?: string;
          line2?: string | null;
          line3?: string | null;
          match_key?: never;
          organization_id?: string;
          postal_code?: string | null;
          region?: string | null;
          status?: string;
          type?: Database["public"]["Enums"]["address_type"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_addresses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_addresses_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "customer_addresses_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_item_aliases: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_description: string | null;
          customer_id: string;
          customer_part_number: string;
          customer_part_number_normalized: string | null;
          id: string;
          organization_id: string;
          product_id: string;
          source_inbound_order_id: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_description?: string | null;
          customer_id: string;
          customer_part_number: string;
          customer_part_number_normalized?: never;
          id?: string;
          organization_id: string;
          product_id: string;
          source_inbound_order_id?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_description?: string | null;
          customer_id?: string;
          customer_part_number?: string;
          customer_part_number_normalized?: never;
          id?: string;
          organization_id?: string;
          product_id?: string;
          source_inbound_order_id?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_item_aliases_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_item_aliases_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "customer_item_aliases_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "customer_item_aliases_organization_id_source_inbound_order_fkey";
            columns: ["organization_id", "source_inbound_order_id"];
            isOneToOne: false;
            referencedRelation: "inbound_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "customer_item_aliases_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_prices: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_id: string;
          id: string;
          organization_id: string;
          product_id: string;
          unit_price: number;
          updated_at: string;
          updated_by: string | null;
          valid_from: string;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          id?: string;
          organization_id: string;
          product_id: string;
          unit_price: number;
          updated_at?: string;
          updated_by?: string | null;
          valid_from: string;
          valid_to?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          id?: string;
          organization_id?: string;
          product_id?: string;
          unit_price?: number;
          updated_at?: string;
          updated_by?: string | null;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_prices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_prices_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "customer_prices_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "customer_prices_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          account_number: string | null;
          account_number_normalized: string | null;
          created_at: string;
          created_by: string | null;
          date_order_hint: string;
          email: string | null;
          hold_reason: string | null;
          hold_set_at: string | null;
          hold_set_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          organization_id: string;
          payment_terms: string | null;
          phone: string | null;
          status: Database["public"]["Enums"]["customer_status"];
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          account_number?: string | null;
          account_number_normalized?: never;
          created_at?: string;
          created_by?: string | null;
          date_order_hint?: string;
          email?: string | null;
          hold_reason?: string | null;
          hold_set_at?: string | null;
          hold_set_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          organization_id: string;
          payment_terms?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["customer_status"];
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          account_number?: string | null;
          account_number_normalized?: never;
          created_at?: string;
          created_by?: string | null;
          date_order_hint?: string;
          email?: string | null;
          hold_reason?: string | null;
          hold_set_at?: string | null;
          hold_set_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          payment_terms?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["customer_status"];
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_hold_set_by_fkey";
            columns: ["hold_set_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_sequences: {
        Row: {
          next_value: number;
          organization_id: string;
          period: number;
          sequence_name: string;
        };
        ComputedFields: never;
        Insert: {
          next_value?: number;
          organization_id: string;
          period?: number;
          sequence_name: string;
        };
        Update: {
          next_value?: number;
          organization_id?: string;
          period?: number;
          sequence_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_sequences_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      extraction_runs: {
        Row: {
          attempt: number;
          available_at: string;
          claim_token: string | null;
          claimed_at: string | null;
          created_at: string;
          duration_ms: number | null;
          error_code: string | null;
          error_message: string | null;
          failure_kind: string | null;
          finished_at: string | null;
          id: string;
          inbound_order_id: string;
          lease_expires_at: string | null;
          max_attempts: number;
          organization_id: string;
          output_schema_version: string;
          overall_confidence: number | null;
          provider: string;
          provider_version: string | null;
          raw_output: Json | null;
          source_document_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["extraction_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attempt?: number;
          available_at?: string;
          claim_token?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          failure_kind?: string | null;
          finished_at?: string | null;
          id?: string;
          inbound_order_id: string;
          lease_expires_at?: string | null;
          max_attempts?: number;
          organization_id: string;
          output_schema_version?: string;
          overall_confidence?: number | null;
          provider: string;
          provider_version?: string | null;
          raw_output?: Json | null;
          source_document_id: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["extraction_status"];
          updated_at?: string;
        };
        Update: {
          attempt?: number;
          available_at?: string;
          claim_token?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          failure_kind?: string | null;
          finished_at?: string | null;
          id?: string;
          inbound_order_id?: string;
          lease_expires_at?: string | null;
          max_attempts?: number;
          organization_id?: string;
          output_schema_version?: string;
          overall_confidence?: number | null;
          provider?: string;
          provider_version?: string | null;
          raw_output?: Json | null;
          source_document_id?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["extraction_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extraction_runs_organization_id_inbound_order_id_fkey";
            columns: ["organization_id", "inbound_order_id"];
            isOneToOne: false;
            referencedRelation: "inbound_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "extraction_runs_organization_id_source_document_id_fkey";
            columns: ["organization_id", "source_document_id"];
            isOneToOne: false;
            referencedRelation: "source_documents";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      inbound_order_lines: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_part_number: string | null;
          description: string | null;
          expected_unit_price: number | null;
          field_meta: NonNullable<Json>;
          id: string;
          inbound_order_id: string;
          line_no: number;
          match_method: Database["public"]["Enums"]["match_method"] | null;
          match_score: number | null;
          organization_id: string;
          page_number: number | null;
          po_line_total: number | null;
          po_quantity: number | null;
          po_unit_price: number | null;
          po_uom: string | null;
          price_source: Database["public"]["Enums"]["price_source"] | null;
          product_id: string | null;
          quantity: number | null;
          remember_alias: boolean;
          removed_at: string | null;
          removed_by: string | null;
          removed_reason: string | null;
          unit_price: number | null;
          uom_conversion_note: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_part_number?: string | null;
          description?: string | null;
          expected_unit_price?: number | null;
          field_meta?: NonNullable<Json>;
          id?: string;
          inbound_order_id: string;
          line_no: number;
          match_method?: Database["public"]["Enums"]["match_method"] | null;
          match_score?: number | null;
          organization_id: string;
          page_number?: number | null;
          po_line_total?: number | null;
          po_quantity?: number | null;
          po_unit_price?: number | null;
          po_uom?: string | null;
          price_source?: Database["public"]["Enums"]["price_source"] | null;
          product_id?: string | null;
          quantity?: number | null;
          remember_alias?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          removed_reason?: string | null;
          unit_price?: number | null;
          uom_conversion_note?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_part_number?: string | null;
          description?: string | null;
          expected_unit_price?: number | null;
          field_meta?: NonNullable<Json>;
          id?: string;
          inbound_order_id?: string;
          line_no?: number;
          match_method?: Database["public"]["Enums"]["match_method"] | null;
          match_score?: number | null;
          organization_id?: string;
          page_number?: number | null;
          po_line_total?: number | null;
          po_quantity?: number | null;
          po_unit_price?: number | null;
          po_uom?: string | null;
          price_source?: Database["public"]["Enums"]["price_source"] | null;
          product_id?: string | null;
          quantity?: number | null;
          remember_alias?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          removed_reason?: string | null;
          unit_price?: number | null;
          uom_conversion_note?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inbound_order_lines_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_order_lines_organization_id_inbound_order_id_fkey";
            columns: ["organization_id", "inbound_order_id"];
            isOneToOne: false;
            referencedRelation: "inbound_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inbound_order_lines_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inbound_order_lines_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_order_lines_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inbound_orders: {
        Row: {
          assigned_to: string | null;
          bill_to: Json | null;
          bill_to_address_id: string | null;
          cancel_note: string | null;
          cancel_reason: Database["public"]["Enums"]["cancel_reason"] | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          customer_hint_id: string | null;
          customer_id: string | null;
          customer_po_number: string | null;
          customer_po_number_normalized: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          document_tax_total: number | null;
          document_total: number | null;
          field_meta: NonNullable<Json>;
          id: string;
          latest_extraction_run_id: string | null;
          manual_entry: boolean;
          notes: string | null;
          organization_id: string;
          payment_terms: string | null;
          po_date: string | null;
          reference: string;
          requested_delivery_date: string | null;
          sales_order_id: string | null;
          ship_to: Json | null;
          ship_to_address_id: string | null;
          source_document_id: string;
          status: Database["public"]["Enums"]["inbound_order_status"];
          submit_note: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          updated_at: string;
          updated_by: string | null;
          validated_version: number | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          bill_to?: Json | null;
          bill_to_address_id?: string | null;
          cancel_note?: string | null;
          cancel_reason?: Database["public"]["Enums"]["cancel_reason"] | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          customer_hint_id?: string | null;
          customer_id?: string | null;
          customer_po_number?: string | null;
          customer_po_number_normalized?: never;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          document_tax_total?: number | null;
          document_total?: number | null;
          field_meta?: NonNullable<Json>;
          id?: string;
          latest_extraction_run_id?: string | null;
          manual_entry?: boolean;
          notes?: string | null;
          organization_id: string;
          payment_terms?: string | null;
          po_date?: string | null;
          reference: string;
          requested_delivery_date?: string | null;
          sales_order_id?: string | null;
          ship_to?: Json | null;
          ship_to_address_id?: string | null;
          source_document_id: string;
          status?: Database["public"]["Enums"]["inbound_order_status"];
          submit_note?: string | null;
          submitted_at?: string | null;
          submitted_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          validated_version?: number | null;
          version?: number;
        };
        Update: {
          assigned_to?: string | null;
          bill_to?: Json | null;
          bill_to_address_id?: string | null;
          cancel_note?: string | null;
          cancel_reason?: Database["public"]["Enums"]["cancel_reason"] | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          customer_hint_id?: string | null;
          customer_id?: string | null;
          customer_po_number?: string | null;
          customer_po_number_normalized?: never;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          document_tax_total?: number | null;
          document_total?: number | null;
          field_meta?: NonNullable<Json>;
          id?: string;
          latest_extraction_run_id?: string | null;
          manual_entry?: boolean;
          notes?: string | null;
          organization_id?: string;
          payment_terms?: string | null;
          po_date?: string | null;
          reference?: string;
          requested_delivery_date?: string | null;
          sales_order_id?: string | null;
          ship_to?: Json | null;
          ship_to_address_id?: string | null;
          source_document_id?: string;
          status?: Database["public"]["Enums"]["inbound_order_status"];
          submit_note?: string | null;
          submitted_at?: string | null;
          submitted_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          validated_version?: number | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inbound_orders_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_orders_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_orders_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_customer_hint_id_fkey";
            columns: ["organization_id", "customer_hint_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_customer_id_bill_to_address_fkey";
            columns: ["organization_id", "customer_id", "bill_to_address_id"];
            isOneToOne: false;
            referencedRelation: "customer_addresses";
            referencedColumns: ["organization_id", "customer_id", "id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_customer_id_ship_to_address_fkey";
            columns: ["organization_id", "customer_id", "ship_to_address_id"];
            isOneToOne: false;
            referencedRelation: "customer_addresses";
            referencedColumns: ["organization_id", "customer_id", "id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_latest_extraction_run_id_fkey";
            columns: ["organization_id", "latest_extraction_run_id"];
            isOneToOne: false;
            referencedRelation: "extraction_runs";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_sales_order_id_id_fkey";
            columns: ["organization_id", "sales_order_id", "id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["organization_id", "id", "inbound_order_id"];
          },
          {
            foreignKeyName: "inbound_orders_organization_id_source_document_id_fkey";
            columns: ["organization_id", "source_document_id"];
            isOneToOne: false;
            referencedRelation: "source_documents";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inbound_orders_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_orders_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_outbox: {
        Row: {
          aggregate_id: string;
          aggregate_type: string;
          attempts: number;
          available_at: string;
          created_at: string;
          event_type: string;
          id: number;
          last_error: string | null;
          organization_id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          schema_version: string;
        };
        ComputedFields: never;
        Insert: {
          aggregate_id: string;
          aggregate_type: string;
          attempts?: number;
          available_at?: string;
          created_at?: string;
          event_type: string;
          id?: never;
          last_error?: string | null;
          organization_id: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          schema_version?: string;
        };
        Update: {
          aggregate_id?: string;
          aggregate_type?: string;
          attempts?: number;
          available_at?: string;
          created_at?: string;
          event_type?: string;
          id?: never;
          last_error?: string | null;
          organization_id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          schema_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_outbox_organization_id_aggregate_id_fkey";
            columns: ["organization_id", "aggregate_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "integration_outbox_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_balances: {
        Row: {
          available: number | null;
          location_id: string;
          on_hand: number;
          organization_id: string;
          product_id: string;
          reserved: number;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          available?: never;
          location_id: string;
          on_hand?: number;
          organization_id: string;
          product_id: string;
          reserved?: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          available?: never;
          location_id?: string;
          on_hand?: number;
          organization_id?: string;
          product_id?: string;
          reserved?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_balances_organization_id_location_id_fkey";
            columns: ["organization_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_balances_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          actor_user_id: string | null;
          adjustment_reason: Database["public"]["Enums"]["adjustment_reason"] | null;
          id: number;
          location_id: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          note: string | null;
          occurred_at: string;
          on_hand_after: number;
          on_hand_delta: number;
          organization_id: string;
          product_id: string;
          reference: string | null;
          request_id: string | null;
          reserved_after: number;
          reserved_delta: number;
          sales_order_id: string | null;
          sales_order_line_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_user_id?: string | null;
          adjustment_reason?: Database["public"]["Enums"]["adjustment_reason"] | null;
          id?: never;
          location_id: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          note?: string | null;
          occurred_at?: string;
          on_hand_after: number;
          on_hand_delta: number;
          organization_id: string;
          product_id: string;
          reference?: string | null;
          request_id?: string | null;
          reserved_after: number;
          reserved_delta: number;
          sales_order_id?: string | null;
          sales_order_line_id?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          adjustment_reason?: Database["public"]["Enums"]["adjustment_reason"] | null;
          id?: never;
          location_id?: string;
          movement_type?: Database["public"]["Enums"]["movement_type"];
          note?: string | null;
          occurred_at?: string;
          on_hand_after?: number;
          on_hand_delta?: number;
          organization_id?: string;
          product_id?: string;
          reference?: string | null;
          request_id?: string | null;
          reserved_after?: number;
          reserved_delta?: number;
          sales_order_id?: string | null;
          sales_order_line_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_organization_id_product_id_location_id_fkey";
            columns: ["organization_id", "product_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "inventory_balances";
            referencedColumns: ["organization_id", "product_id", "location_id"];
          },
          {
            foreignKeyName: "inventory_movements_organization_id_sales_order_id_sales_o_fkey";
            columns: ["organization_id", "sales_order_id", "sales_order_line_id"];
            isOneToOne: false;
            referencedRelation: "sales_order_lines";
            referencedColumns: ["organization_id", "sales_order_id", "id"];
          },
        ];
      };
      locations: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_default: boolean;
          name: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_default?: boolean;
          name: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_default?: boolean;
          name?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "locations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "locations_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_exceptions: {
        Row: {
          authorizes_duplicate: boolean | null;
          code: Database["public"]["Enums"]["exception_code"];
          created_at: string;
          details: NonNullable<Json>;
          fingerprint: string;
          id: string;
          inbound_order_id: string;
          inbound_order_line_id: string | null;
          message: string;
          organization_id: string;
          overridable: boolean;
          overridden_at: string | null;
          overridden_by: string | null;
          override_conflicts: Json | null;
          override_fingerprint: string | null;
          override_reason: string | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: Database["public"]["Enums"]["exception_severity"];
          status: Database["public"]["Enums"]["exception_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          authorizes_duplicate?: never;
          code: Database["public"]["Enums"]["exception_code"];
          created_at?: string;
          details?: NonNullable<Json>;
          fingerprint: string;
          id?: string;
          inbound_order_id: string;
          inbound_order_line_id?: string | null;
          message: string;
          organization_id: string;
          overridable: boolean;
          overridden_at?: string | null;
          overridden_by?: string | null;
          override_conflicts?: Json | null;
          override_fingerprint?: string | null;
          override_reason?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity: Database["public"]["Enums"]["exception_severity"];
          status?: Database["public"]["Enums"]["exception_status"];
          updated_at?: string;
        };
        Update: {
          authorizes_duplicate?: never;
          code?: Database["public"]["Enums"]["exception_code"];
          created_at?: string;
          details?: NonNullable<Json>;
          fingerprint?: string;
          id?: string;
          inbound_order_id?: string;
          inbound_order_line_id?: string | null;
          message?: string;
          organization_id?: string;
          overridable?: boolean;
          overridden_at?: string | null;
          overridden_by?: string | null;
          override_conflicts?: Json | null;
          override_fingerprint?: string | null;
          override_reason?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: Database["public"]["Enums"]["exception_severity"];
          status?: Database["public"]["Enums"]["exception_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_exceptions_organization_id_inbound_order_id_fkey";
            columns: ["organization_id", "inbound_order_id"];
            isOneToOne: false;
            referencedRelation: "inbound_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_exceptions_organization_id_inbound_order_id_inbound__fkey";
            columns: ["organization_id", "inbound_order_id", "inbound_order_line_id"];
            isOneToOne: false;
            referencedRelation: "inbound_order_lines";
            referencedColumns: ["organization_id", "inbound_order_id", "id"];
          },
          {
            foreignKeyName: "order_exceptions_overridden_by_fkey";
            columns: ["overridden_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_exceptions_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          token_hash: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          invited_by: string | null;
          joined_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          base_currency: string;
          confidence_threshold: number;
          country_code: string;
          created_at: string;
          created_by: string | null;
          duplicate_lookback_days: number;
          id: string;
          is_demo: boolean;
          legal_name: string | null;
          locale: string;
          name: string;
          price_tolerance_pct: number;
          require_independent_approval: boolean;
          sales_order_prefix: string;
          slug: string;
          status: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          base_currency: string;
          confidence_threshold?: number;
          country_code: string;
          created_at?: string;
          created_by?: string | null;
          duplicate_lookback_days?: number;
          id?: string;
          is_demo?: boolean;
          legal_name?: string | null;
          locale?: string;
          name: string;
          price_tolerance_pct?: number;
          require_independent_approval?: boolean;
          sales_order_prefix?: string;
          slug: string;
          status?: string;
          timezone: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          base_currency?: string;
          confidence_threshold?: number;
          country_code?: string;
          created_at?: string;
          created_by?: string | null;
          duplicate_lookback_days?: number;
          id?: string;
          is_demo?: boolean;
          legal_name?: string | null;
          locale?: string;
          name?: string;
          price_tolerance_pct?: number;
          require_independent_approval?: boolean;
          sales_order_prefix?: string;
          slug?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_base_currency_fkey";
            columns: ["base_currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "organizations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organizations_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          gtin: string | null;
          id: string;
          list_price: number;
          name: string;
          organization_id: string;
          quantity_decimals: number;
          reorder_point: number | null;
          selling_uom: string;
          sku: string;
          sku_normalized: string | null;
          status: Database["public"]["Enums"]["product_status"];
          track_inventory: boolean;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          gtin?: string | null;
          id?: string;
          list_price: number;
          name: string;
          organization_id: string;
          quantity_decimals?: number;
          reorder_point?: number | null;
          selling_uom: string;
          sku: string;
          sku_normalized?: never;
          status?: Database["public"]["Enums"]["product_status"];
          track_inventory?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          gtin?: string | null;
          id?: string;
          list_price?: number;
          name?: string;
          organization_id?: string;
          quantity_decimals?: number;
          reorder_point?: number | null;
          selling_uom?: string;
          sku?: string;
          sku_normalized?: never;
          status?: Database["public"]["Enums"]["product_status"];
          track_inventory?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_selling_uom_fkey";
            columns: ["selling_uom"];
            isOneToOne: false;
            referencedRelation: "uom_codes";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "products_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          mfa_required: boolean;
          pseudonymized_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name: string;
          id: string;
          mfa_required?: boolean;
          pseudonymized_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          mfa_required?: boolean;
          pseudonymized_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales_order_lines: {
        Row: {
          allocated_qty: number;
          backorder_handled_at: string | null;
          backorder_handled_by: string | null;
          backorder_handled_reason: string | null;
          backordered_qty: number;
          created_at: string;
          currency_minor_unit: number;
          customer_part_number: string | null;
          description_as_ordered: string | null;
          id: string;
          line_no: number;
          line_total: number;
          match_method: Database["public"]["Enums"]["match_method"];
          organization_id: string;
          price_source: Database["public"]["Enums"]["price_source"];
          product_id: string;
          product_name: string;
          quantity: number;
          sales_order_id: string;
          sku: string;
          source_inbound_order_line_id: string;
          unit_price: number;
          uom: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          allocated_qty: number;
          backorder_handled_at?: string | null;
          backorder_handled_by?: string | null;
          backorder_handled_reason?: string | null;
          backordered_qty: number;
          created_at?: string;
          currency_minor_unit: number;
          customer_part_number?: string | null;
          description_as_ordered?: string | null;
          id?: string;
          line_no: number;
          line_total: number;
          match_method: Database["public"]["Enums"]["match_method"];
          organization_id: string;
          price_source: Database["public"]["Enums"]["price_source"];
          product_id: string;
          product_name: string;
          quantity: number;
          sales_order_id: string;
          sku: string;
          source_inbound_order_line_id: string;
          unit_price: number;
          uom: string;
          updated_at?: string;
        };
        Update: {
          allocated_qty?: number;
          backorder_handled_at?: string | null;
          backorder_handled_by?: string | null;
          backorder_handled_reason?: string | null;
          backordered_qty?: number;
          created_at?: string;
          currency_minor_unit?: number;
          customer_part_number?: string | null;
          description_as_ordered?: string | null;
          id?: string;
          line_no?: number;
          line_total?: number;
          match_method?: Database["public"]["Enums"]["match_method"];
          organization_id?: string;
          price_source?: Database["public"]["Enums"]["price_source"];
          product_id?: string;
          product_name?: string;
          quantity?: number;
          sales_order_id?: string;
          sku?: string;
          source_inbound_order_line_id?: string;
          unit_price?: number;
          uom?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_backorder_handled_by_fkey";
            columns: ["backorder_handled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_order_lines_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_order_lines_organization_id_sales_order_id_fkey";
            columns: ["organization_id", "sales_order_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_order_lines_organization_id_source_inbound_order_lin_fkey";
            columns: ["organization_id", "source_inbound_order_line_id"];
            isOneToOne: false;
            referencedRelation: "inbound_order_lines";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_order_lines_uom_fkey";
            columns: ["uom"];
            isOneToOne: false;
            referencedRelation: "uom_codes";
            referencedColumns: ["code"];
          },
        ];
      };
      sales_orders: {
        Row: {
          approved_at: string;
          approved_by: string;
          bill_to: Json | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          currency: string;
          customer_id: string;
          customer_po_number: string | null;
          customer_po_number_normalized: string | null;
          duplicate_override: boolean | null;
          duplicate_override_exception_id: string | null;
          duplicate_override_marker: boolean | null;
          fulfilled_at: string | null;
          fulfilled_by: string | null;
          id: string;
          inbound_order_id: string;
          notes: string | null;
          order_number: string;
          organization_id: string;
          payment_terms: string | null;
          po_date: string | null;
          requested_delivery_date: string | null;
          ship_to: NonNullable<Json>;
          status: Database["public"]["Enums"]["sales_order_status"];
          subtotal: number;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at: string;
          approved_by: string;
          bill_to?: Json | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          currency: string;
          customer_id: string;
          customer_po_number?: string | null;
          customer_po_number_normalized?: never;
          duplicate_override?: never;
          duplicate_override_exception_id?: string | null;
          duplicate_override_marker?: never;
          fulfilled_at?: string | null;
          fulfilled_by?: string | null;
          id?: string;
          inbound_order_id: string;
          notes?: string | null;
          order_number: string;
          organization_id: string;
          payment_terms?: string | null;
          po_date?: string | null;
          requested_delivery_date?: string | null;
          ship_to: NonNullable<Json>;
          status?: Database["public"]["Enums"]["sales_order_status"];
          subtotal: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          bill_to?: Json | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          customer_po_number?: string | null;
          customer_po_number_normalized?: never;
          duplicate_override?: never;
          duplicate_override_exception_id?: string | null;
          duplicate_override_marker?: never;
          fulfilled_at?: string | null;
          fulfilled_by?: string | null;
          id?: string;
          inbound_order_id?: string;
          notes?: string | null;
          order_number?: string;
          organization_id?: string;
          payment_terms?: string | null;
          po_date?: string | null;
          requested_delivery_date?: string | null;
          ship_to?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["sales_order_status"];
          subtotal?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_orders_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_orders_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_orders_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "sales_orders_fulfilled_by_fkey";
            columns: ["fulfilled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_orders_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_orders_organization_id_inbound_order_id_duplicate_ov_fkey";
            columns: [
              "organization_id",
              "inbound_order_id",
              "duplicate_override_exception_id",
              "duplicate_override_marker",
            ];
            isOneToOne: false;
            referencedRelation: "order_exceptions";
            referencedColumns: [
              "organization_id",
              "inbound_order_id",
              "id",
              "authorizes_duplicate",
            ];
          },
          {
            foreignKeyName: "sales_orders_organization_id_inbound_order_id_fkey";
            columns: ["organization_id", "inbound_order_id"];
            isOneToOne: false;
            referencedRelation: "inbound_orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      source_documents: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string;
          organization_id: string;
          original_filename: string;
          page_count: number | null;
          rejection_reason: string | null;
          sha256: string | null;
          size_bytes: number | null;
          storage_bucket: string;
          storage_path: string | null;
          stored_at: string | null;
          updated_at: string;
          upload_status: Database["public"]["Enums"]["upload_status"];
          uploaded_by: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          mime_type: string;
          organization_id: string;
          original_filename: string;
          page_count?: number | null;
          rejection_reason?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path?: never;
          stored_at?: string | null;
          updated_at?: string;
          upload_status?: Database["public"]["Enums"]["upload_status"];
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mime_type?: string;
          organization_id?: string;
          original_filename?: string;
          page_count?: number | null;
          rejection_reason?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path?: never;
          stored_at?: string | null;
          updated_at?: string;
          upload_status?: Database["public"]["Enums"]["upload_status"];
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      uom_codes: {
        Row: {
          code: string;
          name: string;
          un_ece_code: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          name: string;
          un_ece_code?: string | null;
        };
        Update: {
          code?: string;
          name?: string;
          un_ece_code?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      address_type: "billing" | "shipping";
      adjustment_reason:
        "opening_balance" | "cycle_count" | "damaged" | "lost" | "found" | "correction";
      cancel_reason: "duplicate" | "not_a_purchase_order" | "sent_in_error" | "other";
      customer_status: "active" | "on_hold" | "inactive";
      exception_code:
        | "UNCONFIRMED_FIELDS"
        | "CUSTOMER_UNMATCHED"
        | "CUSTOMER_ON_HOLD"
        | "CUSTOMER_INACTIVE"
        | "PO_NUMBER_MISSING"
        | "DUPLICATE_PO_NUMBER"
        | "DUPLICATE_DOCUMENT"
        | "POSSIBLE_DUPLICATE"
        | "SHIP_TO_MISSING"
        | "SHIP_TO_NOT_ON_FILE"
        | "CURRENCY_MISMATCH"
        | "DATE_AMBIGUOUS"
        | "REQUESTED_DATE_PAST"
        | "TOTAL_MISMATCH"
        | "PRODUCT_UNMATCHED"
        | "PRODUCT_DISCONTINUED"
        | "QUANTITY_INVALID"
        | "UOM_MISMATCH"
        | "PRICE_MISMATCH"
        | "PRICE_MISSING"
        | "DUPLICATE_LINE"
        | "INSUFFICIENT_STOCK";
      exception_severity: "blocking" | "warning";
      exception_status: "open" | "resolved" | "acknowledged" | "overridden";
      extraction_status: "queued" | "running" | "succeeded" | "failed";
      inbound_order_status:
        | "received"
        | "extracting"
        | "extraction_failed"
        | "in_review"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "cancelled";
      invitation_status: "pending" | "accepted" | "revoked" | "expired";
      match_method: "alias" | "sku" | "gtin" | "description" | "manual";
      member_role: "owner" | "admin" | "approver" | "processor" | "inventory_manager" | "viewer";
      member_status: "active" | "suspended";
      movement_type: "receipt" | "adjustment" | "reservation" | "reservation_release" | "issue";
      price_source: "po_price" | "customer_price" | "list_price";
      product_status: "active" | "discontinued";
      sales_order_status: "confirmed" | "fulfilled" | "cancelled";
      upload_status: "pending" | "stored" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      address_type: ["billing", "shipping"],
      adjustment_reason: [
        "opening_balance",
        "cycle_count",
        "damaged",
        "lost",
        "found",
        "correction",
      ],
      cancel_reason: ["duplicate", "not_a_purchase_order", "sent_in_error", "other"],
      customer_status: ["active", "on_hold", "inactive"],
      exception_code: [
        "UNCONFIRMED_FIELDS",
        "CUSTOMER_UNMATCHED",
        "CUSTOMER_ON_HOLD",
        "CUSTOMER_INACTIVE",
        "PO_NUMBER_MISSING",
        "DUPLICATE_PO_NUMBER",
        "DUPLICATE_DOCUMENT",
        "POSSIBLE_DUPLICATE",
        "SHIP_TO_MISSING",
        "SHIP_TO_NOT_ON_FILE",
        "CURRENCY_MISMATCH",
        "DATE_AMBIGUOUS",
        "REQUESTED_DATE_PAST",
        "TOTAL_MISMATCH",
        "PRODUCT_UNMATCHED",
        "PRODUCT_DISCONTINUED",
        "QUANTITY_INVALID",
        "UOM_MISMATCH",
        "PRICE_MISMATCH",
        "PRICE_MISSING",
        "DUPLICATE_LINE",
        "INSUFFICIENT_STOCK",
      ],
      exception_severity: ["blocking", "warning"],
      exception_status: ["open", "resolved", "acknowledged", "overridden"],
      extraction_status: ["queued", "running", "succeeded", "failed"],
      inbound_order_status: [
        "received",
        "extracting",
        "extraction_failed",
        "in_review",
        "pending_approval",
        "approved",
        "rejected",
        "cancelled",
      ],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      match_method: ["alias", "sku", "gtin", "description", "manual"],
      member_role: ["owner", "admin", "approver", "processor", "inventory_manager", "viewer"],
      member_status: ["active", "suspended"],
      movement_type: ["receipt", "adjustment", "reservation", "reservation_release", "issue"],
      price_source: ["po_price", "customer_price", "list_price"],
      product_status: ["active", "discontinued"],
      sales_order_status: ["confirmed", "fulfilled", "cancelled"],
      upload_status: ["pending", "stored", "rejected"],
    },
  },
} as const;
