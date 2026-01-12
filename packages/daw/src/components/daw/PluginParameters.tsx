/**
 * Plugin Parameters Component
 * Generic parameter controls for WAM plugins with throttled updates
 */

import { memo, useCallback, useRef, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WAMParameter } from '../../lib/wam';

// ============================================================================
// Types
// ============================================================================

export interface PluginParametersProps {
  /** Plugin instance ID */
  instanceId: string;
  /** List of plugin parameters */
  parameters: WAMParameter[];
  /** Current parameter values */
  values: Map<string, number>;
  /** Callback when parameter value changes */
  onParameterChange: (paramId: string, value: number) => void;
  /** Additional CSS classes */
  className?: string;
}

interface ParameterControlProps {
  parameter: WAMParameter;
  value: number;
  onChange: (value: number) => void;
  onReset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Throttle interval for parameter updates (30Hz = ~33ms) */
const THROTTLE_INTERVAL_MS = 33;

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for throttled callback execution
 */
function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  intervalMs: number
): (...args: Args) => void {
  const lastCallRef = useRef<number>(0);
  const pendingArgsRef = useRef<Args | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= intervalMs) {
        lastCallRef.current = now;
        callback(...args);
      } else {
        // Schedule a pending call
        pendingArgsRef.current = args;
        
        if (!timeoutRef.current) {
          timeoutRef.current = setTimeout(() => {
            if (pendingArgsRef.current) {
              lastCallRef.current = Date.now();
              callback(...pendingArgsRef.current);
              pendingArgsRef.current = null;
            }
            timeoutRef.current = null;
          }, intervalMs - timeSinceLastCall);
        }
      }
    },
    [callback, intervalMs]
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Float/Int parameter rendered as a slider with knob appearance
 */
const SliderParameter = memo(function SliderParameter({
  parameter,
  value,
  onChange,
  onReset,
}: ParameterControlProps) {
  const min = parameter.minValue ?? 0;
  const max = parameter.maxValue ?? 1;
  const step = parameter.type === 'int' ? 1 : (max - min) / 100;
  
  // Calculate percentage for visual indicator
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onChange(newValue);
    },
    [onChange]
  );

  const formatValue = (val: number): string => {
    if (parameter.type === 'int') return Math.round(val).toString();
    if (Math.abs(val) < 0.01) return val.toExponential(1);
    return val.toFixed(2);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-daw-text-secondary truncate flex-1">
          {parameter.label}
        </label>
        <button
          type="button"
          onClick={onReset}
          className="p-0.5 rounded text-daw-text-muted hover:text-daw-text-primary transition-colors"
          aria-label={`Reset ${parameter.label} to default`}
          title="Reset to default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
      
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="w-full h-2 bg-daw-bg-tertiary rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:bg-daw-accent-primary [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:active:cursor-grabbing
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:bg-daw-accent-primary [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-grab"
          aria-label={parameter.label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
        />
        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-2 bg-daw-accent-primary/30 rounded-full pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between text-[10px] font-mono text-daw-text-muted">
        <span>{formatValue(min)}</span>
        <span className="text-daw-text-secondary">{formatValue(value)}{parameter.units ? ` ${parameter.units}` : ''}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
});

/**
 * Boolean parameter rendered as a toggle switch
 */
const BooleanParameter = memo(function BooleanParameter({
  parameter,
  value,
  onChange,
  onReset,
}: ParameterControlProps) {
  const isOn = value >= 0.5;

  const handleToggle = useCallback(() => {
    onChange(isOn ? 0 : 1);
  }, [isOn, onChange]);

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <label className="text-xs text-daw-text-secondary truncate flex-1">
        {parameter.label}
      </label>
      
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors',
            isOn ? 'bg-daw-accent-primary' : 'bg-daw-bg-tertiary'
          )}
          role="switch"
          aria-checked={isOn}
          aria-label={parameter.label}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
              isOn ? 'translate-x-5' : 'translate-x-0.5'
            )}
          />
        </button>
        
        <button
          type="button"
          onClick={onReset}
          className="p-0.5 rounded text-daw-text-muted hover:text-daw-text-primary transition-colors"
          aria-label={`Reset ${parameter.label} to default`}
          title="Reset to default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

/**
 * Choice/Enum parameter rendered as a select dropdown
 */
const ChoiceParameter = memo(function ChoiceParameter({
  parameter,
  value,
  onChange,
  onReset,
}: ParameterControlProps) {
  const choices = parameter.choices ?? [];
  const selectedIndex = Math.round(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = parseInt(e.target.value, 10);
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-daw-text-secondary truncate flex-1">
          {parameter.label}
        </label>
        <button
          type="button"
          onClick={onReset}
          className="p-0.5 rounded text-daw-text-muted hover:text-daw-text-primary transition-colors"
          aria-label={`Reset ${parameter.label} to default`}
          title="Reset to default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
      
      <select
        value={selectedIndex}
        onChange={handleChange}
        className="w-full px-2 py-1.5 bg-daw-bg-tertiary border border-daw-border-secondary rounded text-sm text-daw-text-primary focus:outline-none focus:border-daw-accent-primary"
        aria-label={parameter.label}
      >
        {choices.map((choice, index) => (
          <option key={choice} value={index}>
            {choice}
          </option>
        ))}
      </select>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const PluginParameters = memo(function PluginParameters({
  instanceId: _instanceId,
  parameters,
  values,
  onParameterChange,
  className,
}: PluginParametersProps) {
  // Throttle parameter changes to prevent flooding
  const throttledOnChange = useThrottledCallback(onParameterChange, THROTTLE_INTERVAL_MS);

  // Group parameters by type for better organization
  const groupedParams = useMemo(() => {
    const floatParams: WAMParameter[] = [];
    const intParams: WAMParameter[] = [];
    const boolParams: WAMParameter[] = [];
    const choiceParams: WAMParameter[] = [];

    parameters.forEach((param) => {
      switch (param.type) {
        case 'float':
          floatParams.push(param);
          break;
        case 'int':
          intParams.push(param);
          break;
        case 'boolean':
          boolParams.push(param);
          break;
        case 'choice':
          choiceParams.push(param);
          break;
      }
    });

    return { floatParams, intParams, boolParams, choiceParams };
  }, [parameters]);

  const renderParameter = useCallback(
    (parameter: WAMParameter) => {
      const value = values.get(parameter.id) ?? parameter.defaultValue;

      const handleChange = (newValue: number) => {
        throttledOnChange(parameter.id, newValue);
      };

      const handleReset = () => {
        onParameterChange(parameter.id, parameter.defaultValue);
      };

      const props: ParameterControlProps = {
        parameter,
        value,
        onChange: handleChange,
        onReset: handleReset,
      };

      switch (parameter.type) {
        case 'boolean':
          return <BooleanParameter key={parameter.id} {...props} />;
        case 'choice':
          return <ChoiceParameter key={parameter.id} {...props} />;
        case 'int':
        case 'float':
        default:
          return <SliderParameter key={parameter.id} {...props} />;
      }
    },
    [values, throttledOnChange, onParameterChange]
  );

  if (parameters.length === 0) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <p className="text-sm text-daw-text-muted">
          No parameters available
        </p>
      </div>
    );
  }

  const { floatParams, intParams, boolParams, choiceParams } = groupedParams;
  const sliderParams = [...floatParams, ...intParams];

  return (
    <div className={cn('p-3 space-y-4', className)}>
      {/* Boolean toggles in a row */}
      {boolParams.length > 0 && (
        <div className="space-y-1">
          {boolParams.map(renderParameter)}
        </div>
      )}

      {/* Choice dropdowns */}
      {choiceParams.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {choiceParams.map(renderParameter)}
        </div>
      )}

      {/* Slider parameters */}
      {sliderParams.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {sliderParams.map(renderParameter)}
        </div>
      )}
    </div>
  );
});
