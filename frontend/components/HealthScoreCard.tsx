/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import {
  Background,
  Controls,
  Edge,
  EdgeLabelRenderer,
  Position as FlowPosition,
  getBezierPath,
  MiniMap,
  Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { RiskRegistry } from "@/clients/generated/accounts/riskRegistry"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPairLtFromRegistry } from "@/lib/portfolio"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { cn, formatCurrency, formatNumberWithSuffix } from "@/lib/utils"
import { Position } from "@/types/portfolio"

interface CustomEdgeProps {
  data?: { isHighlighted: boolean; threshold: number }
  id: string
  sourcePosition: FlowPosition
  sourceX: number
  sourceY: number
  style?: React.CSSProperties
  targetPosition: FlowPosition
  targetX: number
  targetY: number
}

interface HealthScoreCardProps {
  assetRegistry: AssetRegistry | null
  borrowWorth: number
  depositWorth: number
  riskRegistry: null | RiskRegistry
  wrapped: {
    borrows: Position[]
    deposits: Position[]
  }
}

interface PositionBoxProps {
  isHovered: boolean
  position: Position
  share: number
  type: "borrow" | "deposit"
}

export default function HealthScoreCard({
  assetRegistry,
  borrowWorth,
  depositWorth,
  riskRegistry,
  wrapped,
}: HealthScoreCardProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hoveredNodeId, setHoveredNodeId] = useState<null | string>(null)
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
        data: {
          label: (
            <PositionBox
              isHovered={hoveredNodeId === `deposit-${mintAddress}`}
              position={deposit}
              share={share}
              type="deposit"
            />
          ),
        },
        id: `deposit-${mintAddress}`,
        position: { x: leftSideCenter - boxWidth / 2, y: yPosition },
        sourcePosition: FlowPosition.Right,
        style: {
          background: "transparent",
          border: "none",
          height: boxHeight,
          width: boxWidth,
        },
        type: "default",
      }
    })

    const borrowNodes: Node[] = allBorrows.map((borrow, index) => {
      const value = borrow.amount * borrow.asset.price.latest
      const share = borrowWorth > 0 ? (value / borrowWorth) * 100 : 0

      const startY = (containerHeight - allBorrows.length * (boxHeight + 20)) / 2
      const yPosition = startY + index * (boxHeight + 20)

      const mintAddress = borrow.asset.zodial?.mint ?? `borrow-${index}`

      return {
        data: {
          label: (
            <PositionBox
              isHovered={hoveredNodeId === `borrow-${mintAddress}`}
              position={borrow}
              share={share}
              type="borrow"
            />
          ),
        },
        id: `borrow-${mintAddress}`,
        position: { x: rightSideCenter - boxWidth / 2, y: yPosition },
        style: {
          background: "transparent",
          border: "none",
          height: boxHeight,
          width: boxWidth,
        },
        targetPosition: FlowPosition.Left,
        type: "default",
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
        const threshold =
          depositCmcId && borrowCmcId
            ? getPairLtFromRegistry(depositCmcId, borrowCmcId, assetRegistry, riskRegistry)
            : 0.9

        flowEdges.push({
          animated: isHighlighted,
          data: {
            isHighlighted,
            threshold,
          },
          id: `edge-${depositMint}-${borrowMint}`,
          source: `deposit-${depositMint}`,
          style: {
            stroke: isHighlighted ? "#3255c7" : "#374151",
            strokeWidth: isHighlighted ? 3 : 1,
          },
          target: `borrow-${borrowMint}`,
          type: "custom",
        })
      })
    })

    setContainerHeight(containerHeight)
    setNodes([...depositNodes, ...borrowNodes])
    setEdges(flowEdges)
  }, [
    allDeposits,
    allBorrows,
    depositWorth,
    borrowWorth,
    hoveredNodeId,
    setEdges,
    setNodes,
    assetRegistry,
    riskRegistry,
  ])

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
            className="bg-transparent"
            edges={edges}
            edgeTypes={edgeTypes}
            elementsSelectable={false}
            fitView
            nodes={nodes}
            nodesConnectable={false}
            nodesDraggable={false}
            onEdgesChange={onEdgesChange}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onNodesChange={onNodesChange}
            panOnDrag={false}
            preventScrolling={false}
            zoomOnDoubleClick={false}
            zoomOnPinch={false}
            zoomOnScroll={false}
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

function CustomEdge({
  data,
  id,
  sourcePosition,
  sourceX,
  sourceY,
  style = {},
  targetPosition,
  targetX,
  targetY,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    curvature: data?.isHighlighted ? 0.4 : 0.25,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  })

  return (
    <>
      <path
        className="react-flow__edge-path"
        d={edgePath}
        id={id}
        style={{
          ...style,
          zIndex: data?.isHighlighted ? 1000 : 1,
        }}
      />
      <EdgeLabelRenderer>
        {data?.isHighlighted && (
          <div
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-all duration-200",
              data?.isHighlighted
                ? "border-primary bg-primary text-foreground shadow-lg"
                : "border-border bg-card text-muted-foreground",
            )}
            style={{
              fontSize: 12,
              pointerEvents: "all",
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {((data?.threshold ?? 0.9) * 100).toFixed(0)}%
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

function PositionBox({ isHovered, position, share, type }: PositionBoxProps) {
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
