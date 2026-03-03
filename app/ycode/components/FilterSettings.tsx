'use client';

import React, { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import SettingsPanel from './SettingsPanel';
import type { Layer } from '@/types';

interface FilterSettingsProps {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

export default function FilterSettings({ layer, onLayerUpdate }: FilterSettingsProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!layer || layer.name !== 'filter') {
    return null;
  }

  const filterOnChange = layer.settings?.filterOnChange ?? false;

  const handleToggleFilterOnChange = (checked: boolean) => {
    onLayerUpdate(layer.id, {
      settings: {
        ...layer.settings,
        filterOnChange: checked,
      },
    });
  };

  return (
    <SettingsPanel
      title="Behaviour"
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
    >
      <div className="flex items-center justify-between gap-2">
        <Label variant="muted">Filter on value change</Label>
        <Switch
          checked={filterOnChange}
          onCheckedChange={handleToggleFilterOnChange}
        />
      </div>
    </SettingsPanel>
  );
}
