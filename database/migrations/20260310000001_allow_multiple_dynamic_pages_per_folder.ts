import type { Knex } from 'knex';

/**
 * Migration: Allow multiple CMS (dynamic) pages per folder
 *
 * Recreates the slug uniqueness index to exclude dynamic pages,
 * since they all share the '*' wildcard slug by design and should
 * be allowed to coexist in the same folder.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS pages_slug_is_published_folder_unique');

  await knex.schema.raw(`
    CREATE UNIQUE INDEX pages_slug_is_published_folder_unique
    ON pages(
      slug,
      is_published,
      COALESCE(page_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(error_page, 0)
    )
    WHERE deleted_at IS NULL AND is_dynamic = false
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS pages_slug_is_published_folder_unique');

  await knex.schema.raw(`
    CREATE UNIQUE INDEX pages_slug_is_published_folder_unique
    ON pages(
      slug,
      is_published,
      COALESCE(page_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(error_page, 0)
    )
    WHERE deleted_at IS NULL
  `);
}
