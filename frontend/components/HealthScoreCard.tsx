"use client"

import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position as FlowPosition,
  getBezierPath,
  EdgeLabelRenderer,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useCallback, useMemo, useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatCurrency, formatNumberWithSuffix } from "@/lib/utils"
import { getPairLtFromRegistry } from "@/lib/portfolio"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { Position } from "@/types/portfolio"
import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { RiskRegistry } from "@/clients/generated/accounts/riskRegistry"

interface CustomEdgeProps {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: FlowPosition
  targetPosition: FlowPosition
  style?: React.CSSProperties
  data?: { threshold: number; isHighlighted: boolean }
}

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: data?.isHighlighted ? 0.4 : 0.25,
  })

  return (
    <>
      <path
        id={id}
        style={{
          ...style,
          zIndex: data?.isHighlighted ? 1000 : 1,
        }}
        className="react-flow__edge-path"
        d={edgePath}
      />
      <EdgeLabelRenderer>
        {data?.isHighlighted && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: "all",
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-all duration-200",
              data?.isHighlighted
                ? "border-primary bg-primary text-foreground shadow-lg"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {((data?.threshold ?? 0.9) * 100).toFixed(0)}%
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

interface PositionBoxProps {
  position: Position
  share: number
  type: "deposit" | "borrow"
  isHovered: boolean
}

function PositionBox({ position, share, type, isHovered }: PositionBoxProps) {
  const value = position.amount * position.asset.price.latest

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-between rounded-lg border-2 p-4 transition-all duration-200",
        "bg-card backdrop-blur-sm",
        isHovered ? "border-primary shadow-primary/25 shadow-lg" : "border-muted-foreground",
        type === "deposit" ? "border-l-success border-l-4" : "border-l-warning border-l-4",
      )}
    >
      <div className="flex flex-col items-start">
        <div className="text-foreground text-sm font-medium">{position.asset.symbol}</div>
        <div className="text-muted-foreground text-sm font-semibold">
          {formatNumberWithSuffix(position.amount)}
        </div>
      </div>
      <div className="flex flex-col items-end">
        <div className="text-foreground text-sm">${formatNumberWithSuffix(value)}</div>
        <div className="text-primary text-sm font-semibold">{formatNumberWithSuffix(share)}%</div>
      </div>
    </div>
  )
}

interface HealthScoreCardProps {
  wrapped: {
    deposits: Position[]
    borrows: Position[]
  }
  depositWorth: number
  borrowWorth: number
  assetRegistry: AssetRegistry | null
  riskRegistry: RiskRegistry | null
}

export default function HealthScoreCard({
  wrapped,
  depositWorth,
  borrowWorth,
  assetRegistry,
  riskRegistry,
}: HealthScoreCardProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 800,
  )
  const [containerHeight, setContainerHeight] = useState<number>(600)

  const allDeposits = wrapped.deposits
  const allBorrows = wrapped.borrows

  useEffect(() => {
    console.log("Deposits:", allDeposits)
    console.log("Borrows:", allBorrows)
  })

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    const containerWidth = 800
    const maxPositions = Math.max(allDeposits.length, allBorrows.length)
    const containerHeight = Math.max(300, maxPositions * 120)
    const boxWidth = 192
    const boxHeight = 60

    const leftSideCenter = containerWidth * 0.25
    const rightSideCenter = containerWidth * 0.75

    const depositNodes: Node[] = allDeposits.map((deposit, index) => {
      const value = deposit.amount * deposit.asset.price.latest
      const share = depositWorth > 0 ? (value / depositWorth) * 100 : 0

      const startY = (containerHeight - allDeposits.length * (boxHeight + 20)) / 2
      const yPosition = startY + index * (boxHeight + 20)

      const mintAddress = deposit.asset.zodial?.mint ?? `deposit-${index}`

      return {
        id: `deposit-${mintAddress}`,
        type: "default",
        position: { x: leftSideCenter - boxWidth / 2, y: yPosition },
        data: {
          label: (
            <PositionBox
              position={deposit}
              share={share}
              type="deposit"
              isHovered={hoveredNodeId === `deposit-${mintAddress}`}
            />
          ),
        },
        style: {
          background: "transparent",
          border: "none",
          width: boxWidth,
          height: boxHeight,
        },
        sourcePosition: FlowPosition.Right,
      }
    })

    const borrowNodes: Node[] = allBorrows.map((borrow, index) => {
      const value = borrow.amount * borrow.asset.price.latest
      const share = borrowWorth > 0 ? (value / borrowWorth) * 100 : 0

      const startY = (containerHeight - allBorrows.length * (boxHeight + 20)) / 2
      const yPosition = startY + index * (boxHeight + 20)

      const mintAddress = borrow.asset.zodial?.mint ?? `borrow-${index}`

      return {
        id: `borrow-${mintAddress}`,
        type: "default",
        position: { x: rightSideCenter - boxWidth / 2, y: yPosition },
        data: {
          label: (
            <PositionBox
              position={borrow}
              share={share}
              type="borrow"
              isHovered={hoveredNodeId === `borrow-${mintAddress}`}
            />
          ),
        },
        style: {
          background: "transparent",
          border: "none",
          width: boxWidth,
          height: boxHeight,
        },
        targetPosition: FlowPosition.Left,
      }
    })

    const flowEdges: Edge[] = []
    allDeposits.forEach((deposit) => {
      const depositMint = deposit.asset.zodial?.mint ?? `deposit-${allDeposits.indexOf(deposit)}`

      allBorrows.forEach((borrow) => {
        const borrowMint = borrow.asset.zodial?.mint ?? `borrow-${allBorrows.indexOf(borrow)}`

        const isHighlighted =
          hoveredNodeId === `deposit-${depositMint}` || hoveredNodeId === `borrow-${borrowMint}`

        // Resolve real CMC IDs via mint addresses to avoid mixing
        // registry indices with CoinMarketCap IDs
        const depositCmcId = deposit.asset.mint
          ? getAssetByMint(deposit.asset.mint)?.cmcId
          : undefined
        const borrowCmcId = borrow.asset.mint ? getAssetByMint(borrow.asset.mint)?.cmcId : undefined

        // Use on-chain RiskRegistry for pair-specific liquidation thresholds
        // Falls back to JSON-based lookup if RiskRegistry is unavailable
        const threshold = depositCmcId && borrowCmcId
          ? getPairLtFromRegistry(depositCmcId, borrowCmcId, assetRegistry, riskRegistry)
          : 0.9

        flowEdges.push({
          id: `edge-${depositMint}-${borrowMint}`,
          source: `deposit-${depositMint}`,
          target: `borrow-${borrowMint}`,
          type: "custom",
          animated: isHighlighted,
          style: {
            stroke: isHighlighted ? "#8b5cf6" : "#374151",
            strokeWidth: isHighlighted ? 3 : 1,
          },
          data: {
            threshold,
            isHighlighted,
          },
        })
      })
    })

    setContainerHeight(containerHeight)
    setNodes([...depositNodes, ...borrowNodes])
    setEdges(flowEdges)
  }, [allDeposits, allBorrows, depositWorth, borrowWorth, hoveredNodeId, setEdges, setNodes])

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id)
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  const edgeTypes = useMemo(
    () => ({
      custom: CustomEdge,
    }),
    [],
  )

  // Hide card on mobile
  if (windowWidth < 800) {
    return null
  }

  // Don't render if no positions
  if (!allDeposits.length || !allBorrows.length) {
    return null
  }

  return (
    <Card className="border-foreground bg-card rounded-xs border-2 shadow-xl lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-semibold tracking-tight">Health Score Visualization</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="mb-8 flex items-center justify-around gap-72 px-8">
          <div className="text-center">
            <h2 className="text-success mb-2 text-2xl font-bold">Deposits</h2>
            <div className="text-foreground text-sm">{formatCurrency(depositWorth, 2)}</div>
          </div>
          <div className="text-center">
            <h2 className="text-warning mb-2 text-2xl font-bold">Borrows</h2>
            <div className="text-foreground text-sm">{formatCurrency(borrowWorth, 2)}</div>
          </div>
        </div>
        <div className="w-full" style={{ height: `${containerHeight}px` }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            fitView
            className="bg-transparent"
          >
            <Background style={{ display: "none" }} />
            <Controls style={{ display: "none" }} />
            <MiniMap style={{ display: "none" }} />
          </ReactFlow>
          <style jsx>{`
            :global(.react-flow__handle-top),
            :global(.react-flow__handle-bottom) {
              display: none !important;
            }
          `}</style>
        </div>
      </CardContent>
    </Card>
  )
}
