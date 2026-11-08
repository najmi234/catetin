CREATE TYPE "public"."pocket_entry_kind" AS ENUM('topup', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TABLE "pocket_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pocket_id" uuid NOT NULL,
	"kind" "pocket_entry_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"transfer_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pocket_entries_amount_nonzero" CHECK ("pocket_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "pockets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#f59e0b' NOT NULL,
	"icon" text DEFAULT 'wallet' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pockets_user_name_key" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "pocket_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pocket_id" uuid;--> statement-breakpoint
ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_pocket_id_pockets_id_fk" FOREIGN KEY ("pocket_id") REFERENCES "public"."pockets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockets" ADD CONSTRAINT "pockets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pocket_entries_pocket_idx" ON "pocket_entries" USING btree ("pocket_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_pocket_id_pockets_id_fk" FOREIGN KEY ("pocket_id") REFERENCES "public"."pockets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pocket_id_pockets_id_fk" FOREIGN KEY ("pocket_id") REFERENCES "public"."pockets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_pocket_idx" ON "transactions" USING btree ("pocket_id");