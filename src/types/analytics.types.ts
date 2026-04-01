/**
 * Analytics Types
 * Types for metrics, performance data, and reporting
 */

export interface AnalyticsData {
  period: string;
  totalMessages: number;
  conversationsStarted: number;
  conversationsClosed: number;
  avgResponseTime: number;
  resolutionRate: number;
}

export interface AgentAnalytics {
  agentId: string;
  agentName: string;
  messagesHandled: number;
  avgResponseTime: number;
  satisfactionScore?: number;
}

export interface AnalyticsResult {
  conversations: any;
  messages: any;
  agents: AgentAnalytics[];
  sla: any;
}
