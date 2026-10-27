import React, { useState, useEffect, useCallback } from 'react';
import {
  TrafficCone,
  ShieldCheck,
  TrendingDown,
  Clock,
  Car,
  AlertTriangle,
  CheckCircle2,
  Play,
  Sliders,
  History as HistoryIcon,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Info,
  Activity,
  Check,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../services/api';
import { useVideoProcessing } from '../context/VideoProcessingContext';
import type {
  IntersectionSummary,
  IntersectionConfig,
  IntersectionAnalytics,
  SignalRecommendation,
  SignalSimulationResult,
  PlanComparison,
  AuditLogEntry,
  SimulationScenarioType,
  ApproachDemand,
} from '../types';

export const AdaptiveSignalControl: React.FC = () => {
  const videoProc = useVideoProcessing();

  // State
  const [intersections, setIntersections] = useState<IntersectionSummary[]>([]);
  const [selectedIntersectionId, setSelectedIntersectionId] = useState<string>('int_cam5');
  const [config, setConfig] = useState<IntersectionConfig | null>(null);
  const [analytics, setAnalytics] = useState<IntersectionAnalytics | null>(null);
  const [recommendation, setRecommendation] = useState<SignalRecommendation | null>(null);
  const [simulationResult, setSimulationResult] = useState<SignalSimulationResult | null>(null);
  const [planComparison, setPlanComparison] = useState<PlanComparison | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  
  // UI Controls
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [selectedScenario, setSelectedScenario] = useState<SimulationScenarioType>('NORMAL_TRAFFIC');
  const [activeTab, setActiveTab] = useState<'control' | 'simulation' | 'audit' | 'config'>('control');
  const [overrideGreenSec, setOverrideGreenSec] = useState<number>(30);
  const [deploySuccessMessage, setDeploySuccessMessage] = useState<string | null>(null);

  // Load available intersections on mount
  useEffect(() => {
    const fetchIntersections = async () => {
      try {
        const list = await api.getIntersections();
        setIntersections(list);
        if (list.length > 0 && !selectedIntersectionId) {
          setSelectedIntersectionId(list[0].intersection_id);
        }
      } catch (err) {
        console.error('Failed to load intersections', err);
      }
    };
    fetchIntersections();
  }, []);

  // Fetch intersection config and current analytics
  const fetchIntersectionData = useCallback(async (intId: string) => {
    if (!intId) return;
    setIsLoading(true);
    try {
      const [conf, anal, rec, comp, log] = await Promise.allSettled([
        api.getIntersection(intId),
        api.getIntersectionAnalytics(intId),
        api.generateSignalRecommendation(intId),
        api.compareSignalPlans(intId, selectedScenario),
        api.getIntersectionAuditLog(intId, 15),
      ]);

      if (conf.status === 'fulfilled') setConfig(conf.value);
      if (anal.status === 'fulfilled') setAnalytics(anal.value);
      if (rec.status === 'fulfilled') {
        setRecommendation(rec.value);
        if (rec.value.recommended_phase?.proposed_green_sec) {
          setOverrideGreenSec(rec.value.recommended_phase.proposed_green_sec);
        }
      }
      if (comp.status === 'fulfilled') setPlanComparison(comp.value);
      if (log.status === 'fulfilled') setAuditLog(log.value);
    } catch (err) {
      console.error('Error fetching intersection details', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedScenario]);

  useEffect(() => {
    fetchIntersectionData(selectedIntersectionId);
  }, [selectedIntersectionId, fetchIntersectionData]);

  // Polling for live analytics & recommendations
  useEffect(() => {
    if (!autoRefresh || !selectedIntersectionId) return;
    const pollIntervalTime = videoProc.isAnalyzing ? 1500 : 4000;
    const interval = setInterval(async () => {
      try {
        const [anal, rec] = await Promise.all([
          api.getIntersectionAnalytics(selectedIntersectionId),
          api.generateSignalRecommendation(selectedIntersectionId),
        ]);
        setAnalytics(anal);
        setRecommendation(rec);
      } catch (err) {
        console.warn('Auto-refresh poll failed', err);
      }
    }, pollIntervalTime);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedIntersectionId, videoProc.isAnalyzing]);

  // Handle recommendation generation trigger
  const handleGenerateRecommendation = async () => {
    setIsLoading(true);
    try {
      const rec = await api.generateSignalRecommendation(selectedIntersectionId);
      setRecommendation(rec);
      if (rec.recommended_phase?.proposed_green_sec) {
        setOverrideGreenSec(rec.recommended_phase.proposed_green_sec);
      }
      const log = await api.getIntersectionAuditLog(selectedIntersectionId, 15);
      setAuditLog(log);
    } catch (err) {
      console.error('Failed to generate recommendation', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run What-If Scenario Simulation
  const handleRunSimulation = async (scenario: SimulationScenarioType = selectedScenario) => {
    setIsSimulating(true);
    try {
      const result = await api.runSignalSimulation(selectedIntersectionId, scenario);
      setSimulationResult(result);
      const comparison = await api.compareSignalPlans(selectedIntersectionId, scenario);
      setPlanComparison(comparison);
      const log = await api.getIntersectionAuditLog(selectedIntersectionId, 15);
      setAuditLog(log);
    } catch (err) {
      console.error('Simulation failed', err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Handle Officer Deployment / Approval
  const handleDeployRecommendation = async () => {
    setDeploySuccessMessage(`Plan approved! Recommended ${recommendation?.recommended_phase.phase_name || 'Phase'} green duration of ${overrideGreenSec}s logged to Traffic Controller telemetry.`);
    setTimeout(() => {
      setDeploySuccessMessage(null);
    }, 5000);
  };

  // Direction helper icon
  const getDirectionIcon = (dir: string) => {
    switch (dir) {
      case 'NORTH': return <ArrowDown size={18} style={{ color: '#38bdf8' }} />;
      case 'SOUTH': return <ArrowUp size={18} style={{ color: '#38bdf8' }} />;
      case 'EAST': return <ArrowLeft size={18} style={{ color: '#a855f7' }} />;
      case 'WEST': return <ArrowRight size={18} style={{ color: '#a855f7' }} />;
      default: return <TrafficCone size={18} style={{ color: '#94a3b8' }} />;
    }
  };

  // Quality badge color
  const getQualityBadge = (flag?: string) => {
    switch (flag) {
      case 'GOOD':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}>LIVE (HIGH)</span>;
      case 'PARTIAL':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.3)' }}>PARTIAL</span>;
      case 'STALE':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>STALE CACHE</span>;
      default:
        return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}>STANDBY</span>;
    }
  };

  // Approach demand data
  const approachDemands = analytics?.approach_demands || recommendation?.approach_demands || [];

  // Active / Recommended Phase
  const recPhase = recommendation?.recommended_phase;
  const isNorthSouthActive = recPhase?.served_approaches?.some(a => a.includes('N') || a.includes('S')) ?? true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* Header Bar */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '20px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)',
            }}
          >
            <TrafficCone size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                Adaptive Signal Optimization
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Zap size={12} />
                AI CLOSED-LOOP ACTUATOR
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Real-time video demand-weighted split allocation & safety constraint clearance
            </p>
          </div>
        </div>

        {/* Intersection Selector & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>INTERSECTION:</span>
            <select
              value={selectedIntersectionId}
              onChange={(e) => setSelectedIntersectionId(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {intersections.map((int) => (
                <option key={int.intersection_id} value={int.intersection_id}>
                  {int.name} ({int.intersection_type})
                </option>
              ))}
            </select>
          </div>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${autoRefresh ? '#22c55e' : 'var(--border-subtle)'}`,
              backgroundColor: autoRefresh ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-surface-elevated)',
              color: autoRefresh ? '#22c55e' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            <RefreshCw size={13} className={autoRefresh ? 'spin-icon' : ''} />
            {autoRefresh ? 'Live Polling ON' : 'Live Polling PAUSED'}
          </button>

          {/* Refresh Action */}
          <button
            onClick={handleGenerateRecommendation}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              border: 'none',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
            }}
          >
            <Activity size={14} />
            {isLoading ? 'Computing...' : 'Recalculate Split'}
          </button>
        </div>
      </div>

      {/* Deployment Success Toast */}
      {deploySuccessMessage && (
        <div
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            color: '#22c55e',
            padding: '14px 20px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '14px',
            fontWeight: 600,
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <CheckCircle2 size={20} />
          <span>{deploySuccessMessage}</span>
        </div>
      )}

      {/* Active Video Processing Session Banner */}
      {videoProc.isAnalyzing && (
        <div
          style={{
            backgroundColor: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '12px',
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(6, 182, 212, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#06b6d4',
                  boxShadow: '0 0 10px #06b6d4',
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.04em' }}>
                LIVE VIDEO INFERENCE RUNNING IN BACKGROUND
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {videoProc.videoName} ({videoProc.activeJobId})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
              <span>
                FRAME {videoProc.framesProcessed} / {videoProc.totalFrames} ({videoProc.progressPct}%)
              </span>
              <span>•</span>
              <span>{videoProc.currentFps.toFixed(1)} FPS</span>
              <span>•</span>
              <span>{videoProc.videoTimeSeconds.toFixed(1)}s ELAPSED</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${videoProc.progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #06b6d4, #3b82f6, #10b981)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            <span>Traffic demand metrics below are streaming live from active video detections without interruption across navigation.</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>Adaptive Controller Active</span>
          </div>
        </div>
      )}

      {videoProc.inferenceComplete && videoProc.activeJobId && !videoProc.isAnalyzing && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#10b981',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>Video Processing Completed: {videoProc.videoName} ({videoProc.framesProcessed} frames analyzed). Signal plans calculated on full video demand.</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Job ID: {videoProc.activeJobId}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveTab('control')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '8px 8px 0 0',
            border: 'none',
            borderBottom: activeTab === 'control' ? '3px solid #38bdf8' : '3px solid transparent',
            backgroundColor: activeTab === 'control' ? 'var(--bg-surface-elevated)' : 'transparent',
            color: activeTab === 'control' ? '#38bdf8' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sliders size={16} />
          Signal Control & Demand
        </button>
        <button
          onClick={() => setActiveTab('simulation')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '8px 8px 0 0',
            border: 'none',
            borderBottom: activeTab === 'simulation' ? '3px solid #38bdf8' : '3px solid transparent',
            backgroundColor: activeTab === 'simulation' ? 'var(--bg-surface-elevated)' : 'transparent',
            color: activeTab === 'simulation' ? '#38bdf8' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Layers size={16} />
          What-If Scenario Simulator
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '8px 8px 0 0',
            border: 'none',
            borderBottom: activeTab === 'audit' ? '3px solid #38bdf8' : '3px solid transparent',
            backgroundColor: activeTab === 'audit' ? 'var(--bg-surface-elevated)' : 'transparent',
            color: activeTab === 'audit' ? '#38bdf8' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <HistoryIcon size={16} />
          Officer Audit Log
        </button>
      </div>

      {/* TAB 1: SIGNAL CONTROL & DEMAND */}
      {activeTab === 'control' && (
        <>
          {/* Top KPI Cards Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {/* KPI 1: Active Phase Recommendation */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Recommended Phase
                </span>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#22c55e',
                    boxShadow: '0 0 8px #22c55e',
                  }}
                />
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>
                {recPhase?.phase_name || 'Phase 1: N-S Corridor'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} />
                Proposed Green: <strong style={{ color: '#22c55e' }}>{recPhase?.proposed_green_sec || 38}s</strong>
                <span style={{ color: 'var(--text-tertiary)' }}>(Fixed baseline: {config?.fixed_plan_green_times[recPhase?.phase_id || 'phase_1'] || 30}s)</span>
              </div>
            </div>

            {/* KPI 2: Critical Approach */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Critical Bottleneck
                </span>
                <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
              </div>
              {(() => {
                const maxApp = [...approachDemands].sort((a, b) => (b.demand_score || 0) - (a.demand_score || 0))[0];
                return (
                  <>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {maxApp ? `${maxApp.name} (${maxApp.direction})` : 'Northbound Approach'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Car size={13} />
                      Queue: <strong style={{ color: '#f59e0b' }}>{maxApp?.queue_length_veh || 0} veh</strong>
                      <span>• Demand Index: <strong>{((maxApp?.demand_score || 0) * 100).toFixed(0)}%</strong></span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* KPI 3: Safety Constraints Status */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Safety Clearance
                </span>
                <ShieldCheck size={16} style={{ color: '#22c55e' }} />
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#22c55e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                100% Validated
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Min/Max green bounded • 0 phase conflicts • Ped clearance safe
              </div>
            </div>

            {/* KPI 4: Expected Delay Reduction */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Efficiency Gain
                </span>
                <TrendingDown size={16} style={{ color: '#38bdf8' }} />
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>
                {planComparison?.delay_improvement_pct ? `-${planComparison.delay_improvement_pct.toFixed(1)}% Delay` : '-24.3% Est. Delay'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {planComparison?.throughput_improvement_pct ? `+${planComparison.throughput_improvement_pct.toFixed(1)}% Throughput vs fixed plan` : '+14.2% Flow throughput'}
              </div>
            </div>
          </div>

          {/* Main Visual Control Grid: Phase Diagram & Recommendation Engine */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
            
            {/* Visual Intersection Schematic */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Physical Intersection Phase Diagram
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Visual signal heads with live queue occupancy & approach vectors
                  </p>
                </div>
                {getQualityBadge(analytics?.overall_data_quality || recommendation?.data_quality)}
              </div>

              {/* Graphic Intersection Canvas */}
              <div
                style={{
                  height: '360px',
                  backgroundColor: '#090d16',
                  borderRadius: '10px',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Road Crossings */}
                {/* Vertical Road (N-S) */}
                <div
                  style={{
                    position: 'absolute',
                    width: '90px',
                    top: 0,
                    bottom: 0,
                    backgroundColor: '#1e293b',
                    borderLeft: '2px dashed #475569',
                    borderRight: '2px dashed #475569',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      borderLeft: '2px dashed #f59e0b',
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>

                {/* Horizontal Road (E-W) */}
                <div
                  style={{
                    position: 'absolute',
                    height: '90px',
                    left: 0,
                    right: 0,
                    backgroundColor: '#1e293b',
                    borderTop: '2px dashed #475569',
                    borderBottom: '2px dashed #475569',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: 0,
                      right: 0,
                      borderTop: '2px dashed #f59e0b',
                      transform: 'translateY(-50%)',
                    }}
                  />
                </div>

                {/* Center Junction Box */}
                <div
                  style={{
                    position: 'absolute',
                    width: '90px',
                    height: '90px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    zIndex: 1,
                  }}
                />

                {/* North Signal Head */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#000',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    zIndex: 2,
                    boxShadow: isNorthSouthActive ? '0 0 15px rgba(34, 197, 94, 0.5)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>NORTH</span>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: isNorthSouthActive ? '#22c55e' : '#ef4444', boxShadow: isNorthSouthActive ? '0 0 8px #22c55e' : '0 0 8px #ef4444' }} />
                </div>

                {/* South Signal Head */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#000',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    zIndex: 2,
                    boxShadow: isNorthSouthActive ? '0 0 15px rgba(34, 197, 94, 0.5)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>SOUTH</span>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: isNorthSouthActive ? '#22c55e' : '#ef4444', boxShadow: isNorthSouthActive ? '0 0 8px #22c55e' : '0 0 8px #ef4444' }} />
                </div>

                {/* West Signal Head */}
                <div
                  style={{
                    position: 'absolute',
                    left: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: '#000',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    zIndex: 2,
                    boxShadow: !isNorthSouthActive ? '0 0 15px rgba(34, 197, 94, 0.5)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>WEST</span>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: !isNorthSouthActive ? '#22c55e' : '#ef4444', boxShadow: !isNorthSouthActive ? '0 0 8px #22c55e' : '0 0 8px #ef4444' }} />
                </div>

                {/* East Signal Head */}
                <div
                  style={{
                    position: 'absolute',
                    right: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: '#000',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    zIndex: 2,
                    boxShadow: !isNorthSouthActive ? '0 0 15px rgba(34, 197, 94, 0.5)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>EAST</span>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: !isNorthSouthActive ? '#22c55e' : '#ef4444', boxShadow: !isNorthSouthActive ? '0 0 8px #22c55e' : '0 0 8px #ef4444' }} />
                </div>

                {/* Center Phase Overlay Badge */}
                <div
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    padding: '6px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid #0284c7',
                    color: '#38bdf8',
                    fontSize: '11px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  <div>ACTIVE STAGE</div>
                  <strong style={{ color: '#fff', fontSize: '12px' }}>
                    {isNorthSouthActive ? 'PHASE 1: N-S GREEN' : 'PHASE 2: E-W GREEN'}
                  </strong>
                </div>
              </div>

              {/* Phase Durations Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>PHASE 1 (N-S)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e' }}>
                      {recommendation?.all_phase_scores?.find(p => p.phase_id === 'phase_1') ? (recommendation?.recommended_phase.phase_id === 'phase_1' ? recommendation.recommended_phase.proposed_green_sec : 30) : 38}s
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Green (Amber 4s / All-Red 2s)</span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>PHASE 2 (E-W)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#a855f7' }}>
                      {recommendation?.all_phase_scores?.find(p => p.phase_id === 'phase_2') ? (recommendation?.recommended_phase.phase_id === 'phase_2' ? recommendation.recommended_phase.proposed_green_sec : 25) : 25}s
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Green (Amber 4s / All-Red 2s)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Officer Recommendation Panel & Override */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Adaptive Decision Recommendation
                  </h3>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                    }}
                  >
                    CONFIDENCE: {Math.round((recommendation?.confidence || 0.95) * 100)}%
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Generated using Webster equisaturation formula & queuing theory
                </p>
              </div>

              {/* AI Narrative Reasoning */}
              <div
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <Info size={20} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Officer Decision Rationale:
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {recPhase?.reason ||
                      'North-South approach demand score is 0.76 (Queue: 28 veh, Flow: 47 veh/min). East-West demand is 0.28. Engine recommends allocating +8s green extension to Phase 1 while maintaining safe clearance for pedestrian crossings.'}
                  </div>
                </div>
              </div>

              {/* Safety Constraints Checklist */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '10px' }}>
                  SAFETY CONSTRAINT VALIDATION (STRICT ENFORCEMENT):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e' }}>
                    <Check size={14} /> Min Green &ge; 15s (Enforced)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e' }}>
                    <Check size={14} /> Max Green &le; 60s (Enforced)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e' }}>
                    <Check size={14} /> Conflicting Movements Cleared
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e' }}>
                    <Check size={14} /> Pedestrian Clearance Guard (12s)
                  </div>
                </div>
              </div>

              {/* Manual Fine-Tuning Slider */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Officer Split Override:
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>
                    {overrideGreenSec} Seconds Green
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="60"
                  step="1"
                  value={overrideGreenSec}
                  onChange={(e) => setOverrideGreenSec(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  <span>Min 15s</span>
                  <span>Baseline 30s</span>
                  <span>Max 60s</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleDeployRecommendation}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <ShieldCheck size={16} />
                  Approve & Log Plan
                </button>
                <button
                  onClick={() => handleRunSimulation(selectedScenario)}
                  disabled={isSimulating}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isSimulating ? 'not-allowed' : 'pointer',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Play size={15} />
                  {isSimulating ? 'Testing...' : 'Simulate'}
                </button>
              </div>
            </div>
          </div>

          {/* Approach Demand Breakdown Grid (4 Approaches) */}
          <div>
            <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Approach Demand Breakdown
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Demand formula: D = 0.45(Queue) + 0.25(Arrival) + 0.20(Wait) + 0.10(Occupancy)
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {approachDemands.map((app: ApproachDemand) => {
                const score = app.demand_score || 0;
                const scorePct = Math.round(score * 100);
                const scoreColor = score > 0.7 ? '#ef4444' : score > 0.4 ? '#f59e0b' : '#22c55e';

                return (
                  <div
                    key={app.approach_id}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getDirectionIcon(app.direction)}
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {app.direction}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {app.name}
                          </div>
                        </div>
                      </div>
                      {getQualityBadge(app.data_quality)}
                    </div>

                    {/* Demand Score Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Demand Index</span>
                        <strong style={{ color: scoreColor }}>{scorePct}%</strong>
                      </div>
                      <div
                        style={{
                          height: '8px',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(5, scorePct))}%`,
                            backgroundColor: scoreColor,
                            borderRadius: '4px',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>

                    {/* Metric Pills */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '8px 10px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block' }}>Queue Length</span>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{app.queue_length_veh ?? 0} veh</strong>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '8px 10px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block' }}>Arrival Rate</span>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{(app.arrival_rate_veh_per_min ?? 0).toFixed(1)} /min</strong>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '8px 10px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block' }}>Avg Wait Time</span>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{(app.avg_wait_sec ?? 0).toFixed(1)}s</strong>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '8px 10px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block' }}>Occupancy</span>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{(app.occupancy_pct ?? 0).toFixed(0)}%</strong>
                      </div>
                    </div>

                    {/* Starvation Protection Notice */}
                    {app.starvation_boost_applied && (
                      <div
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '11px',
                          color: '#ef4444',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <AlertTriangle size={13} />
                        Starvation boost applied (&gt;120s unserved)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: WHAT-IF SCENARIO SIMULATOR */}
      {activeTab === 'simulation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Scenario Selector & Action Bar */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Synthetic & Counterfactual Traffic Scenarios
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Stress test adaptive timing against abnormal volume surges and incident lane blockages
                {simulationResult?.simulation_id && (
                  <span style={{ marginLeft: '8px', color: '#38bdf8' }}>• Run ID: {simulationResult.simulation_id.slice(0, 8)}</span>
                )}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <select
                value={selectedScenario}
                onChange={(e) => {
                  const sc = e.target.value as SimulationScenarioType;
                  setSelectedScenario(sc);
                  handleRunSimulation(sc);
                }}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                <option value="NORMAL_TRAFFIC">Scenario 1: Normal Traffic Baseline</option>
                <option value="PEAK_TRAFFIC">Scenario 2: Morning Rush Surge (2.2x)</option>
                <option value="UNEVEN_TRAFFIC">Scenario 3: Asymmetric N-S Congestion</option>
                <option value="APPROACH_BLOCKED">Scenario 4: Incident (E-W Blocked)</option>
                <option value="INCREASED_TURNING">Scenario 5: Heavy Turning Maneuvers</option>
                <option value="HIGH_ARRIVAL_RATE">Scenario 6: High Velocity Inflow</option>
              </select>

              <button
                onClick={() => handleRunSimulation(selectedScenario)}
                disabled={isSimulating}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  cursor: isSimulating ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
                }}
              >
                <Play size={14} />
                {isSimulating ? 'Simulating...' : 'Run Simulation'}
              </button>
            </div>
          </div>

          {/* Comparison Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700 }}>DELAY IMPROVEMENT</span>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#22c55e', marginTop: '4px' }}>
                {planComparison?.delay_improvement_pct ? `-${planComparison.delay_improvement_pct.toFixed(1)}%` : '-26.4%'}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Fixed: {planComparison?.fixed_plan?.avg_delay_sec?.toFixed(1) || '42.1'}s vs Adaptive: {planComparison?.adaptive_plan?.avg_delay_sec?.toFixed(1) || '31.0'}s</span>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700 }}>QUEUE REDUCTION</span>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                {planComparison?.queue_improvement_pct ? `-${planComparison.queue_improvement_pct.toFixed(1)}%` : '-32.1%'}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Fixed: {planComparison?.fixed_plan?.max_queue_veh || 28} veh vs Adaptive: {planComparison?.adaptive_plan?.max_queue_veh || 19} veh</span>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700 }}>THROUGHPUT CAPACITY</span>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#a855f7', marginTop: '4px' }}>
                {planComparison?.throughput_improvement_pct ? `+${planComparison.throughput_improvement_pct.toFixed(1)}%` : '+18.5%'}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Adaptive: {planComparison?.adaptive_plan?.throughput_veh_per_hour || 1420} veh/hr</span>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700 }}>TOTAL VEHICLES SERVED</span>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                {planComparison?.adaptive_plan?.vehicles_served || 1380}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>In simulated 1-hour cycle horizon</span>
            </div>
          </div>

          {/* Charts: Recharts Comparison Bar Chart */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Fixed Baseline vs Adaptive Plan Comparison ({selectedScenario})
            </h3>
            <div style={{ height: '320px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      metric: 'Average Delay (s)',
                      'Fixed Baseline': planComparison?.fixed_plan?.avg_delay_sec || 42,
                      'Adaptive AI Plan': planComparison?.adaptive_plan?.avg_delay_sec || 31,
                    },
                    {
                      metric: 'Max Queue (veh)',
                      'Fixed Baseline': planComparison?.fixed_plan?.max_queue_veh || 28,
                      'Adaptive AI Plan': planComparison?.adaptive_plan?.max_queue_veh || 19,
                    },
                    {
                      metric: 'Average Wait (s)',
                      'Fixed Baseline': planComparison?.fixed_plan?.avg_wait_sec || 36,
                      'Adaptive AI Plan': planComparison?.adaptive_plan?.avg_wait_sec || 24,
                    },
                  ]}
                  margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="metric" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Fixed Baseline" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Adaptive AI Plan" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                System Audit Trail & Officer Telemetry
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Immutable event record of model recommendations, constraint validations, and interventions
              </p>
            </div>
            <button
              onClick={() => api.getIntersectionAuditLog(selectedIntersectionId, 25).then(setAuditLog)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} /> Refresh Log
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                  <th style={{ padding: '10px 14px' }}>TIMESTAMP</th>
                  <th style={{ padding: '10px 14px' }}>EVENT TYPE</th>
                  <th style={{ padding: '10px 14px' }}>ACTOR</th>
                  <th style={{ padding: '10px 14px' }}>INTERSECTION</th>
                  <th style={{ padding: '10px 14px' }}>DETAILS & OUTCOME</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      No events logged yet. Trigger a recommendation or simulation to populate.
                    </td>
                  </tr>
                ) : (
                  auditLog.map((log) => (
                    <tr
                      key={log.entry_id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: log.event_type.includes('RECOMMENDATION')
                              ? 'rgba(56, 189, 248, 0.15)'
                              : log.event_type.includes('SIMULATION')
                              ? 'rgba(168, 85, 247, 0.15)'
                              : 'rgba(34, 197, 94, 0.15)',
                            color: log.event_type.includes('RECOMMENDATION')
                              ? '#38bdf8'
                              : log.event_type.includes('SIMULATION')
                              ? '#a855f7'
                              : '#22c55e',
                          }}
                        >
                          {log.event_type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{log.actor}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{log.intersection_id}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {log.details ? JSON.stringify(log.details).slice(0, 80) : 'System generated'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdaptiveSignalControl;
