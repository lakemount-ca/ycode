'use client';

/**
 * SliderInitializer - Client component that initializes Swiper on production pages.
 * Finds all [data-slider-id] elements, reads settings from data-slider-settings,
 * and mounts Swiper instances.
 */

import { useEffect } from 'react';
import Swiper from 'swiper';
import type { SliderSettings } from '@/types';
import {
  buildProductionSwiperOptions,
  applySwiperEasing,
  loadSwiperCss,
  configureBulletRenderer,
  syncSliderStateAttributes,
} from '@/lib/slider-utils';

export default function SliderInitializer() {
  useEffect(() => {
    loadSwiperCss(document);

    const sliderElements = document.querySelectorAll<HTMLElement>('[data-slider-id]');
    const swiperInstances: Swiper[] = [];

    sliderElements.forEach((el) => {
      const settingsJson = el.getAttribute('data-slider-settings');
      if (!settingsJson) return;

      try {
        const settings: SliderSettings = JSON.parse(settingsJson);
        const config = buildProductionSwiperOptions(settings);

        // Scope navigation/pagination to this specific slider via data attributes
        if (config.navigation && typeof config.navigation === 'object') {
          config.navigation.nextEl = el.querySelector('[data-slider-next]') as HTMLElement;
          config.navigation.prevEl = el.querySelector('[data-slider-prev]') as HTMLElement;
        }
        if (config.pagination && typeof config.pagination === 'object') {
          const isFraction = settings.paginationType === 'fraction';
          const selector = isFraction ? '[data-slider-fraction]' : '[data-slider-pagination]';
          config.pagination.el = el.querySelector(selector) as HTMLElement;
        }

        configureBulletRenderer(el, config);

        const swiper = new Swiper(el, config);
        applySwiperEasing(el, settings.easing);
        syncSliderStateAttributes(swiper);

        // Reveal pagination now that Swiper has generated the real bullets
        const paginationEl = el.querySelector('[data-slider-pagination]') as HTMLElement | null;
        if (paginationEl) paginationEl.style.visibility = '';

        swiperInstances.push(swiper);
      } catch {
        console.error('Failed to initialize slider:', el.getAttribute('data-slider-id'));
      }
    });

    return () => {
      swiperInstances.forEach((swiper) => swiper.destroy(true, true));
    };
  }, []);

  return null;
}
