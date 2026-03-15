import type { Knex } from 'knex';

/**
 * Migration: Add axes column to fonts table
 *
 * Stores variable font axis data (e.g. opsz, wdth) from the Google Fonts API.
 * Used to generate correct CSS2 API URLs that include all axes.
 */

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('fonts', 'axes');
  if (!hasColumn) {
    await knex.schema.alterTable('fonts', (table) => {
      table.jsonb('axes').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('fonts', 'axes');
  if (hasColumn) {
    await knex.schema.alterTable('fonts', (table) => {
      table.dropColumn('axes');
    });
  }
}
